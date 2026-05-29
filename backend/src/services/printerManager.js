const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const configManager = require('../config/configManager');

const logger = {
  info: (msg) => console.log(`[PRINTER MANAGER] INFO: ${msg}`),
  warn: (msg) => console.warn(`[PRINTER MANAGER] WARN: ${msg}`),
  error: (msg) => console.error(`[PRINTER MANAGER] ERROR: ${msg}`)
};

// Queue memory
const printQueue = [];
let isProcessing = false;

// Printer connection status cache
const printerStatus = {
  billing: 'unknown',
  kitchen: 'unknown'
};

/**
 * Queue a new print job
 * @param {Object} job - { type: 'KOT' | 'FINAL_BILL', payload: Buffer }
 */
function queueJob(job) {
  printQueue.push(job);
  logger.info(`Job queued: [${job.type}]. Queue length: ${printQueue.length}`);
  processQueue();
}

/**
 * Periodically process print queue
 */
async function processQueue() {
  if (isProcessing) return;
  if (printQueue.length === 0) return;

  isProcessing = true;
  const currentJob = printQueue[0];
  const maxRetries = 3;
  let attempt = 0;
  let success = false;

  logger.info(`Starting execution of job: [${currentJob.type}]`);

  while (attempt < maxRetries && !success) {
    attempt++;
    try {
      if (currentJob.type === 'KOT') {
        await executePrint('kitchen', currentJob.payload);
      } else if (currentJob.type === 'FINAL_BILL') {
        await executePrint('billing', currentJob.payload);
      }
      success = true;
      logger.info(`Job [${currentJob.type}] printed successfully on attempt ${attempt}`);
    } catch (err) {
      logger.error(`Error printing job [${currentJob.type}] on attempt ${attempt}: ${err.message}`);
      if (attempt < maxRetries) {
        logger.info('Waiting 2 seconds before retrying...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // Dequeue current job to avoid blocking the queue permanently
  printQueue.shift();
  isProcessing = false;
  
  // Recursively process the rest of the queue
  processQueue();
}

/**
 * Perform raw print command
 * @param {String} printerKey - 'kitchen' | 'billing'
 * @param {Buffer} payload - raw ESC/POS bytes
 */
function executePrint(printerKey, payload) {
  return new Promise((resolve, reject) => {
    const config = configManager.getConfig();
    const printerConfig = config.printers[printerKey];

    if (!printerConfig) {
      return reject(new Error(`No configuration found for printer: ${printerKey}`));
    }

    if (printerConfig.type === 'network') {
      const client = new net.Socket();
      const ip = printerConfig.ip;
      const port = printerConfig.port || 9100;

      logger.info(`Connecting to network printer ${printerKey} at ${ip}:${port}...`);
      
      client.setTimeout(5000); // 5 seconds timeout

      client.connect(port, ip, () => {
        logger.info(`Connected to network printer ${printerKey}. Sending payload (${payload.length} bytes)...`);
        client.write(payload, () => {
          client.destroy(); // close connection
          printerStatus[printerKey] = 'online';
          resolve();
        });
      });

      client.on('error', (err) => {
        client.destroy();
        printerStatus[printerKey] = 'offline';
        reject(err);
      });

      client.on('timeout', () => {
        client.destroy();
        printerStatus[printerKey] = 'offline';
        reject(new Error('Connection timed out'));
      });

    } else if (printerConfig.type === 'usb' || printerConfig.type === 'local') {
      const printerName = printerConfig.printerName;
      if (!printerName) {
        return reject(new Error(`printerName must be specified for USB/Local printer: ${printerKey}`));
      }

      // Generate temp files in OS temporary directory (guaranteed read-write safe)
      const tmpDir = path.join(os.tmpdir(), 'bestbill-print');

      try {
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
      } catch (err) {
        logger.error(`Failed to create tmp directory: ${err.message}`);
        printerStatus[printerKey] = 'offline';
        return reject(err);
      }

      const jobId = Date.now() + Math.floor(Math.random() * 1000);
      const binPath = path.join(tmpDir, `print_job_${jobId}.bin`);
      const psPath = path.join(tmpDir, `print_job_${jobId}.ps1`);

      logger.info(`Writing print payload to temp file: ${binPath}`);

      fs.writeFile(binPath, payload, (err) => {
        if (err) {
          logger.error(`Failed to write print payload to temp file: ${err.message}`);
          printerStatus[printerKey] = 'offline';
          return reject(err);
        }

        // Construct PowerShell script calling native Windows Win32 Print Spooler APIs
        const psScript = `$code = @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
    public static extern uint StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    
    public static bool PrintRaw(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "RAW Print Job";
        di.pDataType = "RAW";
        uint docId = StartDocPrinter(hPrinter, 1, di);
        if (docId == 0) { ClosePrinter(hPrinter); return false; }
        if (!StartPagePrinter(hPrinter)) { EndDocPrinter(hPrinter); ClosePrinter(hPrinter); return false; }
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
        int dwWritten;
        bool success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);
        return success;
    }
}
'@
try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
} catch {}

$printer = "${printerName.replace(/\\/g, '\\\\')}"
$filePath = "${binPath.replace(/\\/g, '\\\\')}"
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$result = [RawPrinter]::PrintRaw($printer, $bytes)
if ($result -eq $false) { exit 1 }
exit 0
`;

        fs.writeFile(psPath, psScript, 'utf8', (err) => {
          if (err) {
            logger.error(`Failed to write PowerShell print script: ${err.message}`);
            fs.unlink(binPath, () => {});
            printerStatus[printerKey] = 'offline';
            return reject(err);
          }

          logger.info(`Executing PowerShell print command to target printer: ${printerName}`);
          const cmd = `powershell -ExecutionPolicy Bypass -File "${psPath}"`;

          exec(cmd, (execErr, stdout, stderr) => {
            // Clean up temp files safely
            try {
              fs.unlinkSync(binPath);
              fs.unlinkSync(psPath);
            } catch (cleanupErr) {
              // Ignore cleanup issues
            }

            if (execErr) {
              logger.error(`PowerShell raw printing failed: ${execErr.message} | Stderr: ${stderr}`);
              printerStatus[printerKey] = 'offline';
              return reject(new Error(`PowerShell print failed: ${execErr.message}`));
            }

            logger.info(`Successfully printed via PowerShell Spooler to ${printerName}`);
            printerStatus[printerKey] = 'online';
            resolve();
          });
        });
      });
    } else {
      reject(new Error(`Unsupported printer type: ${printerConfig.type}`));
    }
  });
}

/**
 * Periodically check status of configured printers
 */
async function checkPrinterStatuses() {
  const config = configManager.getConfig();
  if (!config || !config.printers) return;

  for (const key of ['billing', 'kitchen']) {
    const printerConfig = config.printers[key];
    if (!printerConfig) {
      printerStatus[key] = 'not_configured';
      continue;
    }

    if (printerConfig.type === 'network') {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      
      socket.connect(printerConfig.port || 9100, printerConfig.ip, () => {
        printerStatus[key] = 'online';
        socket.destroy();
      });

      socket.on('error', () => {
        printerStatus[key] = 'offline';
        socket.destroy();
      });

      socket.on('timeout', () => {
        printerStatus[key] = 'offline';
        socket.destroy();
      });
    } else if (printerConfig.type === 'usb' || printerConfig.type === 'local') {
      const printerName = printerConfig.printerName;
      if (!printerName) {
        printerStatus[key] = 'offline';
        continue;
      }
      
      const cleanName = printerName.replace(/\\\\.*\\/, ''); // extract share name
      const cmd = `powershell -Command "Get-CimInstance -ClassName Win32_Printer -Filter \\"(ShareName = '${cleanName}' or Name = '${cleanName}') and WorkOffline = false\\""`;
      exec(cmd, (err, stdout) => {
        if (err || !stdout.trim()) {
          printerStatus[key] = 'offline';
        } else {
          printerStatus[key] = 'online';
        }
      });
    }
  }
}

// Start status check (every 30 seconds)
setInterval(checkPrinterStatuses, 30000);
setTimeout(checkPrinterStatuses, 3000); // initial check after startup

function getPrinterStatus() {
  return printerStatus;
}

module.exports = {
  queueJob,
  getPrinterStatus,
  executePrint
};

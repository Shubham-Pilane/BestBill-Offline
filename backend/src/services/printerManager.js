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

// COM Port resolution cache: key is printer name or MAC, value is resolved COM port (e.g. 'COM10')
const comPortCache = {};

class PersistentBluetoothWorker {
  constructor() {
    this.psProcess = null;
    this.isReady = false;
    this.pendingCallbacks = {};
    this.callbackIdSeq = 0;
  }

  ensureStarted() {
    if (this.psProcess && !this.psProcess.killed) return;

    const psScript = [
      '$ports = @{}',
      '$resolvedComs = @{}',
      '',
      'function Get-SerialPort([string]$comName) {',
      '    if (-not $ports.ContainsKey($comName) -or -not $ports[$comName].IsOpen) {',
      '        try {',
      '            $sp = New-Object System.IO.Ports.SerialPort($comName, 115200, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)',
      '            $sp.ReadTimeout = 2000',
      '            $sp.WriteTimeout = 2000',
      '            $sp.Open()',
      '            $ports[$comName] = $sp',
      '        } catch {',
      '            return $null',
      '        }',
      '    }',
      '    return $ports[$comName]',
      '}',
      '',
      'function Print-TargetJob([string]$target, [string]$filePath) {',
      '    $bytes = [System.IO.File]::ReadAllBytes($filePath)',
      '',
      '    if ($resolvedComs.ContainsKey($target)) {',
      '        $cachedPort = $resolvedComs[$target]',
      '        $sp = Get-SerialPort -comName $cachedPort',
      '        if ($sp) {',
      '            try {',
      '                $sp.Write($bytes, 0, $bytes.Length)',
      '                return "SUCCESS|$cachedPort"',
      '            } catch {',
      '                if ($ports.ContainsKey($cachedPort)) {',
      '                    try { $ports[$cachedPort].Close() } catch {}',
      '                    $ports.Remove($cachedPort)',
      '                }',
      '                $resolvedComs.Remove($target)',
      '            }',
      '        } else {',
      '            $resolvedComs.Remove($target)',
      '        }',
      '    }',
      '',
      '    if ($target -match \'^COM\\d+$\') {',
      '        $sp = Get-SerialPort -comName $target',
      '        if ($sp) {',
      '            $sp.Write($bytes, 0, $bytes.Length)',
      '            $resolvedComs[$target] = $target',
      '            return "SUCCESS|$target"',
      '        }',
      '    }',
      '',
      '    $cleanTarget = $target.Replace(\':\', \'\').Replace(\'-\', \'\').Replace(\' \', \'\')',
      '    $btDevs = Get-PnpDevice -Class \'Bluetooth\' -ErrorAction SilentlyContinue',
      '    $matchedMacs = @()',
      '',
      '    foreach ($dev in $btDevs) {',
      '        $fName = [string]$dev.FriendlyName',
      '        $iId = [string]$dev.InstanceId',
      '        if ($fName.IndexOf($target, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or $iId.IndexOf($target, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {',
      '            if ($iId -match \'DEV_([0-9A-Fa-f]{12})\') {',
      '                $matchedMacs += $Matches[1]',
      '            }',
      '        }',
      '    }',
      '    if ($cleanTarget -match \'^[0-9A-Fa-f]{12}$\') {',
      '        $matchedMacs += $cleanTarget',
      '    }',
      '',
      '    $allPorts = Get-PnpDevice -Class \'PORTS\' -ErrorAction SilentlyContinue',
      '',
      '    foreach ($p in $allPorts) {',
      '        $fName = [string]$p.FriendlyName',
      '        $iId = [string]$p.InstanceId',
      '        if ($fName -match \'\\((COM\\d+)\\)\') {',
      '            $comName = $Matches[1]',
      '            foreach ($mac in $matchedMacs) {',
      '                if ($iId.IndexOf($mac, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {',
      '                    $sp = Get-SerialPort -comName $comName',
      '                    if ($sp) {',
      '                        try {',
      '                            $sp.Write($bytes, 0, $bytes.Length)',
      '                            $resolvedComs[$target] = $comName',
      '                            return "SUCCESS|$comName"',
      '                        } catch {}',
      '                    }',
      '                }',
      '            }',
      '        }',
      '    }',
      '',
      '    foreach ($p in $allPorts) {',
      '        $fName = [string]$p.FriendlyName',
      '        if ($fName.IndexOf(\'Bluetooth\', [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and $fName -match \'\\((COM\\d+)\\)\') {',
      '            $comName = $Matches[1]',
      '            $sp = Get-SerialPort -comName $comName',
      '            if ($sp) {',
      '                try {',
      '                    $sp.Write($bytes, 0, $bytes.Length)',
      '                    $resolvedComs[$target] = $comName',
      '                    return "SUCCESS|$comName"',
      '                } catch {}',
      '            }',
      '        }',
      '    }',
      '',
      '    return "ERROR|Could not write to Bluetooth COM port for $target"',
      '}',
      '',
      'Write-Host "WORKER_READY"',
      '',
      'while ($true) {',
      '    $line = [Console]::ReadLine()',
      '    if (-not $line) { break }',
      '    ',
      '    $parts = $line.Split(\'|\')',
      '    if ($parts.Length -lt 3) { continue }',
      '    ',
      '    $reqId = $parts[0]',
      '    $targetDevice = $parts[1]',
      '    $binPath = $parts[2]',
      '    ',
      '    try {',
      '        $res = Print-TargetJob -target $targetDevice -filePath $binPath',
      '        if ($res.StartsWith("SUCCESS|")) {',
      '            $pName = $res.Split(\'|\')[1]',
      '            Write-Host "WORKER_RESULT|$reqId|SUCCESS|$pName"',
      '        } else {',
      '            Write-Host "WORKER_RESULT|$reqId|ERROR|$targetDevice|$res"',
      '        }',
      '    } catch {',
      '        Write-Host "WORKER_RESULT|$reqId|ERROR|$targetDevice|$($_.Exception.Message)"',
      '    }',
      '}'
    ].join('\n');

    try {
      const { spawn } = require('child_process');
      const readline = require('readline');
      this.psProcess = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-Command', psScript]);

      const rl = readline.createInterface({ input: this.psProcess.stdout });
      rl.on('line', (line) => {
        const msg = line.trim();
        if (msg === 'WORKER_READY') {
          this.isReady = true;
          logger.info('Persistent Bluetooth printer worker initialized and ready.');
        } else if (msg.startsWith('WORKER_RESULT|')) {
          const parts = msg.split('|');
          const reqId = parts[1];
          const status = parts[2];
          const comName = parts[3];
          const errMsg = parts[4] || '';

          if (this.pendingCallbacks[reqId]) {
            const { resolve, reject } = this.pendingCallbacks[reqId];
            delete this.pendingCallbacks[reqId];
            if (status === 'SUCCESS') {
              resolve(comName);
            } else {
              reject(new Error(errMsg || 'Persistent print failed'));
            }
          }
        }
      });

      this.psProcess.on('error', (err) => {
        logger.error(`Persistent Bluetooth worker process error: ${err.message}`);
        this.psProcess = null;
        this.isReady = false;
      });

      this.psProcess.on('exit', () => {
        this.psProcess = null;
        this.isReady = false;
      });
    } catch (err) {
      logger.error(`Failed to spawn Persistent Bluetooth worker: ${err.message}`);
    }
  }

  printJob(targetDevice, binPath) {
    return new Promise((resolve, reject) => {
      this.ensureStarted();
      if (!this.psProcess || !this.psProcess.stdin) {
        return reject(new Error('Persistent worker unavailable'));
      }

      const reqId = String(++this.callbackIdSeq);

      const timeout = setTimeout(() => {
        if (this.pendingCallbacks[reqId]) {
          delete this.pendingCallbacks[reqId];
          reject(new Error('Persistent worker print timeout'));
        }
      }, 5000);

      this.pendingCallbacks[reqId] = {
        resolve: (val) => { clearTimeout(timeout); resolve(val); },
        reject: (err) => { clearTimeout(timeout); reject(err); }
      };

      try {
        this.psProcess.stdin.write(`${reqId}|${targetDevice}|${binPath}\n`);
      } catch (err) {
        clearTimeout(timeout);
        delete this.pendingCallbacks[reqId];
        reject(err);
      }
    });
  }
}

const persistentWorker = new PersistentBluetoothWorker();
try { persistentWorker.ensureStarted(); } catch (e) {}

function cleanPrinterName(name) {
  if (!name) return '';
  let cleaned = String(name).trim();
  const parenMatch = cleaned.match(/^([^(]+)/);
  if (parenMatch && parenMatch[1].trim()) {
    cleaned = parenMatch[1].trim();
  }
  return cleaned;
}

/**
 * Perform raw print command
 * @param {String} printerKey - 'kitchen' | 'billing'
 * @param {Buffer} payload - raw ESC/POS bytes
 */
function executePrint(printerKey, payload) {
  return new Promise(async (resolve, reject) => {
    const config = configManager.getConfig();
    const printerConfig = config.printers?.[printerKey];

    if (!printerConfig) {
      return reject(new Error(`No configuration found for printer: ${printerKey}`));
    }

    if (printerConfig.type === 'network') {
      const client = new net.Socket();
      const ip = printerConfig.ip;
      const port = printerConfig.port || 9100;

      logger.info(`Connecting to network printer ${printerKey} at ${ip}:${port}...`);
      
      client.setTimeout(5000);

      client.connect(port, ip, () => {
        logger.info(`Connected to network printer ${printerKey}. Sending payload (${payload.length} bytes)...`);
        client.write(payload, () => {
          client.destroy();
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

    } else if (printerConfig.type === 'bluetooth' || printerConfig.type === 'usb' || printerConfig.type === 'local') {
      const rawPrinterName = printerConfig.printerName || printerConfig.macAddress || '';
      const cleanedName = cleanPrinterName(rawPrinterName);
      const targetDevice = cleanedName || rawPrinterName;
      
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

      fs.writeFile(binPath, payload, async (err) => {
        if (err) {
          logger.error(`Failed to write print payload to temp file: ${err.message}`);
          printerStatus[printerKey] = 'offline';
          return reject(err);
        }

        // Try Instant Persistent Bluetooth Worker First (<10ms)!
        try {
          logger.info(`Routing print job for ${printerKey} (${targetDevice}) to Persistent Worker...`);
          const comName = await persistentWorker.printJob(targetDevice, binPath);
          try { fs.unlinkSync(binPath); } catch (e) {}
          logger.info(`Successfully printed via Persistent Worker on ${comName}`);
          printerStatus[printerKey] = 'online';
          return resolve();
        } catch (workerErr) {
          logger.warn(`Persistent worker print failed for ${targetDevice}: ${workerErr.message}. Trying spooler fallback.`);
        }

        // Spooler Fallback for pure Windows Spooler USB printers
        const psPath = path.join(tmpDir, `print_job_${jobId}.ps1`);
        const psScript = `
param([string]$TargetDevice, [string]$BinFilePath)
$code = @'
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
try { Add-Type -TypeDefinition $code -ErrorAction Stop } catch {}
$bytes = [System.IO.File]::ReadAllBytes($BinFilePath)
$res = [RawPrinter]::PrintRaw($TargetDevice, $bytes)
if ($res) { exit 0 } else { exit 1 }
`;

        fs.writeFile(psPath, psScript, 'utf8', (err) => {
          if (err) {
            fs.unlink(binPath, () => {});
            printerStatus[printerKey] = 'offline';
            return reject(err);
          }
          const cmd = `powershell -ExecutionPolicy Bypass -File "${psPath}" -TargetDevice "${targetDevice.replace(/"/g, '""')}" -BinFilePath "${binPath.replace(/"/g, '""')}"`;
          exec(cmd, (execErr) => {
            try { fs.unlinkSync(binPath); fs.unlinkSync(psPath); } catch (e) {}
            if (execErr) {
              printerStatus[printerKey] = 'offline';
              return reject(new Error(`Print failed: ${execErr.message}`));
            }
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

    if (printerConfig.type === 'bluetooth') {
      printerStatus[key] = 'online';
      continue;
    } else if (printerConfig.type === 'network') {

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

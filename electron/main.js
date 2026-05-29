const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;

// Determine environment
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Set up AppData directory for BestBill POS
const userDataPath = app.getPath('userData'); // C:\Users\<Username>\AppData\Roaming\BestBill
const dbDir = userDataPath;
const uploadsDir = path.join(userDataPath, 'uploads');
const backupsDir = path.join(userDataPath, 'backups');

// Ensure all directories exist
[dbDir, uploadsDir, backupsDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure backend environment variables before booting
process.env.PORT = '5000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'bestbill-pos-offline-secure-key-98765';
process.env.BESTBILL_DB_PATH = path.join(dbDir, 'bestbill.db');
process.env.BESTBILL_UPLOADS_PATH = uploadsDir;
process.env.BESTBILL_BACKUPS_PATH = backupsDir;
process.env.NODE_ENV = isDev ? 'development' : 'production';

console.log(`[ELECTRON] Starting BestBill POS Offline...`);
console.log(`[ELECTRON] Database Path: ${process.env.BESTBILL_DB_PATH}`);
console.log(`[ELECTRON] Uploads Path: ${process.env.BESTBILL_UPLOADS_PATH}`);
console.log(`[ELECTRON] Backups Path: ${process.env.BESTBILL_BACKUPS_PATH}`);

// Start the backend Express server
try {
  require('../backend/src/index.js');
  console.log(`[ELECTRON] Local Express Backend loaded successfully.`);
} catch (err) {
  console.error(`[ELECTRON] Failed to bootstrap local Express backend:`, err);
  app.whenReady().then(() => {
    dialog.showErrorBox(
      'BestBill Backend Fatal Error',
      `Failed to bootstrap the local Express backend server.\n\nError: ${err.message}\n\nStack:\n${err.stack}`
    );
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'BestBill POS - Offline Desktop Edition',
    icon: path.join(__dirname, '../frontend/public/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Exclude native browser menus in production for a premium POS experience
  if (!isDev) {
    mainWindow.setMenuBarVisibility(false);
  }

  // Load correct target
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Expose LAN IP Retrieval via IPC
ipcMain.handle('get-lan-ip', () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
      }
    }
  }
  return addresses[0] || '127.0.0.1';
});

ipcMain.handle('get-lan-ips', () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const k in interfaces) {
    for (const k2 in interfaces[k]) {
      const address = interfaces[k][k2];
      if (address.family === 'IPv4' && !address.internal) {
        addresses.push(address.address);
      }
    }
  }
  return addresses;
});

// Expose Backup path for frontend display
ipcMain.handle('get-backup-path', () => {
  return backupsDir;
});

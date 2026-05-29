const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, selected Electron APIs to the React frontend
contextBridge.exposeInMainWorld('bestbillDesktop', {
  getLanIp: () => ipcRenderer.invoke('get-lan-ip'),
  getLanIps: () => ipcRenderer.invoke('get-lan-ips'),
  getBackupPath: () => ipcRenderer.invoke('get-backup-path'),
  isDesktop: true
});

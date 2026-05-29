const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true
    }
  });

  win.loadFile(path.join(__dirname, 'frontend/public/logo.svg'));
  
  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(__dirname, 'frontend/public/logo.png'), image.toPNG());
      console.log('Saved logo.png');
      app.quit();
    }, 1000);
  });
});

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 800,
    minHeight: 500,
    frame: false, // Отключаем стандартную рамку Windows
    transparent: true, // Прозрачный фон для скругленных углов
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');

  // Обработчики кнопок управления окном
  ipcMain.on('window-min', () => win.minimize());
  ipcMain.on('window-max', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

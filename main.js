const { app, BrowserWindow, ipcMain, screen } = require('electron');
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

  // Окно подрастает по высоте, чтобы список предметов был виден целиком (только увеличиваем, не больше экрана)
  ipcMain.on('window-fit', (e, delta) => {
    delta = Math.round(Number(delta) || 0);
    if (delta <= 0 || win.isMaximized() || win.isFullScreen()) return;
    const b = win.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const height = Math.min(b.height + delta, wa.height);
    if (height <= b.height) return;
    let y = b.y;
    if (y + height > wa.y + wa.height) y = Math.max(wa.y, wa.y + wa.height - height);
    win.setBounds({ x: b.x, y, width: b.width, height }, true);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

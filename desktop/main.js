// Nova AI Hub — desktop shell (Electron). Runs the same server in-process and opens it in a native window.
const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const path = require('path');

if (!app.requestSingleInstanceLock()) { app.exit(0); }

process.env.DATA_DIR = process.env.NOVA_DATA_DIR || path.join(app.getPath('userData'), 'data');
process.env.PORT = process.env.NOVA_PORT || '17860'; // fixed port keeps the page origin stable, so login and UI preferences survive restarts
process.env.PORT_FALLBACK = '1';
process.env.HOST = '127.0.0.1';

let win = null;
let base = '';

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    backgroundColor: '#0a0b12', title: 'Nova AI Hub', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(base + '/media/')) return { action: 'allow' };
    shell.openExternal(url); return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(base)) { e.preventDefault(); shell.openExternal(url); } });
  win.loadURL(base);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const { ready } = require('../server.js');
  const port = await ready;
  base = 'http://127.0.0.1:' + port;
  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open Folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
  createWindow();
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());

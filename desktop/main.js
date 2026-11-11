// Nova AI Hub — desktop shell (Electron).
// Two ways to run:
//  • local  — runs the Nova server inside this app (data stays on this PC)
//  • remote — opens a shared Nova server (VPS / another PC), so Windows, web, Android and the Telegram bot all share
//             the same accounts, providers and chats.
const { app, BrowserWindow, dialog, ipcMain, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) { app.exit(0); }

process.env.DATA_DIR = process.env.NOVA_DATA_DIR || path.join(app.getPath('userData'), 'data');
process.env.PORT = process.env.NOVA_PORT || '17860'; // fixed port keeps the page origin stable, so sign-in and UI preferences survive restarts
process.env.PORT_FALLBACK = '1';
process.env.HOST = '127.0.0.1';

const CONF_FILE = path.join(app.getPath('userData'), 'nova-desktop.json');
const readConf = () => { try { return Object.assign({ mode: 'local', url: '' }, JSON.parse(fs.readFileSync(CONF_FILE, 'utf8'))); } catch { return { mode: 'local', url: '' }; } };
const writeConf = c => { fs.mkdirSync(path.dirname(CONF_FILE), { recursive: true }); fs.writeFileSync(CONF_FILE, JSON.stringify(c, null, 2)); };

let win = null;
let base = '';
let localBase = '';

async function startLocal() {
  if (localBase) return localBase;
  const { ready } = require('../server.js');
  const port = await ready;
  localBase = 'http://127.0.0.1:' + port;
  return localBase;
}
async function targetUrl() {
  const c = readConf();
  if (c.mode === 'remote' && /^https?:\/\//.test(c.url)) return c.url.replace(/\/+$/, '');
  return startLocal();
}

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
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3 || !url.startsWith(base) || readConf().mode !== 'remote') return; // -3 = aborted (normal on reloads)
    const html = `<html dir="auto" style="background:#0a0b12;color:#e9ebf5;font-family:system-ui;display:grid;place-items:center;height:100%"><div style="text-align:center;max-width:520px">
      <h2>Nova AI Hub</h2><p>Cannot reach the server<br><b>${base}</b><br><small>${desc}</small></p><p>سرور در دسترس نیست. آدرس را بررسی کن یا به حالت محلی برگرد.</p>
      <button onclick="location.reload()" style="padding:10px 16px;border-radius:10px;border:0;margin:4px">Retry · تلاش دوباره</button>
      <button onclick="window.novaDesktop.setConnection({mode:'local'})" style="padding:10px 16px;border-radius:10px;border:0;margin:4px">Use this PC · همین کامپیوتر</button></div></html>`;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  });
  win.loadURL(base);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // let the page use the browser folder picker (used when connected to a remote server)
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['fileSystem', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'media'].includes(perm)));
  ipcMain.handle('pick-folder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Open Folder', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));
  ipcMain.on('get-connection', e => { e.returnValue = readConf(); });
  ipcMain.handle('set-connection', async (_e, c) => {
    const next = { mode: c && c.mode === 'remote' ? 'remote' : 'local', url: String((c && c.url) || '').trim().replace(/\/+$/, '') };
    if (next.mode === 'remote') {
      if (!/^https?:\/\/.+/.test(next.url)) return { error: 'Invalid URL' };
      try { const r = await fetch(next.url + '/api/auth/info', { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); if (!('setupNeeded' in j)) throw new Error('Not a Nova server'); }
      catch (e) { return { error: 'Server not reachable: ' + e.message }; }
    } else next.url = readConf().url; // remember the last remote address
    writeConf(next);
    base = await targetUrl();
    win.loadURL(base);
    return { ok: true };
  });
  base = await targetUrl();
  createWindow();
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());

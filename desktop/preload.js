const { contextBridge, ipcRenderer } = require('electron');
const connection = ipcRenderer.sendSync('get-connection');
contextBridge.exposeInMainWorld('novaDesktop', {
  isDesktop: true,
  platform: process.platform,
  connection,
  remote: connection.mode === 'remote',
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  setConnection: c => ipcRenderer.invoke('set-connection', c)
});

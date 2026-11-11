const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('novaDesktop', {
  isDesktop: true,
  platform: process.platform,
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openExternal: url => ipcRenderer.invoke('open-external', url)
});

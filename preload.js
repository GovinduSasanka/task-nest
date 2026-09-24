const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nest', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.send('data:save', data),
  saveSync: (data) => ipcRenderer.sendSync('data:save-sync', data),

  expandSide: () => ipcRenderer.invoke('win:expand-side'),
  setExpanded: (on) => ipcRenderer.invoke('win:set-expanded', on),
  setMini: (on) => ipcRenderer.invoke('win:set-mini', on),
  hide: () => ipcRenderer.send('win:hide'),
  togglePin: () => ipcRenderer.invoke('win:toggle-pin'),
  getPin: () => ipcRenderer.invoke('win:get-pin'),
  onPinChanged: (fn) => ipcRenderer.on('pinned-changed', (_e, v) => fn(v)),

  getAutoStart: () => ipcRenderer.invoke('app:get-autostart'),
  setAutoStart: (on) => ipcRenderer.invoke('app:set-autostart', on),
  quit: () => ipcRenderer.send('app:quit'),
  openData: () => ipcRenderer.send('app:open-data'),
});

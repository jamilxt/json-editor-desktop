'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  openFile: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  saveFile: (content, defaultPath) => ipcRenderer.invoke('dialog:saveFile', { content, defaultPath }),
  confirm: (message, buttons, title) => ipcRenderer.invoke('dialog:confirm', { message, buttons, title }),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
  setDirty: (dirty) => ipcRenderer.send('dirty-state', !!dirty),
  onMenu: (cb) => ipcRenderer.on('menu', (evt, action) => cb(action))
})

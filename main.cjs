'use strict'
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')

const isMac = process.platform === 'darwin'
let win = null

function createWindow () {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#ffffff',
    title: 'JSON Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { win = null })
}

/* ---------------- file dialog helpers ---------------- */

function fileFilters (active) {
  const json = { name: 'JSON', extensions: ['json', 'jsonc', 'ndjson', 'jsonl', 'har', 'ipynb'] }
  const csv = { name: 'CSV', extensions: ['csv'] }
  const all = { name: 'All files', extensions: ['*'] }
  if (active === 'csv') return [csv, json, all]
  return [json, all]
}

async function askOpen (evt, opts = {}) {
  const r = await dialog.showOpenDialog(win, {
    title: opts.title || 'Open file',
    properties: ['openFile'],
    filters: fileFilters(opts.kind)
  })
  if (r.canceled || !r.filePaths[0]) return null
  const fp = r.filePaths[0]
  return { path: fp, name: path.basename(fp), content: fs.readFileSync(fp, 'utf8') }
}

function askSave (evt, { content = '', defaultPath = 'untitled.json' } = {}) {
  const r = dialog.showSaveDialogSync(win, {
    title: 'Save file',
    defaultPath,
    filters: fileFilters(defaultPath.toLowerCase().endsWith('.csv') ? 'csv' : undefined)
  })
  if (!r) return null
  fs.writeFileSync(r, content, 'utf8')
  return r
}

/* ---------------- settings / recent files ---------------- */

function settingsPath () {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings () {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
    return { recentFiles: [], windowSize: null, ...s }
  } catch (e) {
    return { recentFiles: [], windowSize: rendererDefaultSettings() }
  }
}

function rendererDefaultSettings () {
  return { recentFiles: [] }
}

function saveSettings (s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2))
}

/* ---------------- window state helpers ---------------- */

function currentWindowState () {
  const b = win ? win.getBounds() : null
  return b ? { width: b.width, height: b.height, isMaximized: win.isMaximized() } : null
}

/* ---------------- confirm dialog ---------------- */

async function confirmDialog (evt, { message, buttons = ['Cancel', 'OK'], title = 'Confirm' } = {}) {
  const r = await dialog.showMessageBox(win, {
    type: 'question',
    title,
    message,
    buttons,
    defaultId: buttons.length - 1,
    cancelId: 0
  })
  return r.response
}

/* ---------------- IPC surface ---------------- */

function registerIpc () {
  ipcMain.handle('dialog:openFile', askOpen)
  ipcMain.handle('dialog:saveFile', askSave)
  ipcMain.handle('dialog:confirm', confirmDialog)
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.handle('settings:save', (evt, s) => { saveSettings(s); return true })
  ipcMain.handle('window:getState', () => currentWindowState())
  ipcMain.handle('window:minimize', () => win && win.minimize())
  ipcMain.handle('window:toggleMaximize', () => {
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.handle('window:close', () => win && win.close())
}

function buildMenu () {
  const send = (ch, ...args) => () => { if (win) win.webContents.send(ch, ...args) }

  // NOTE: the Edit menu with role entries is REQUIRED on macOS: without it,
  // Cmd+C/Cmd+V/Cmd+A do not work in any text input (Electron routes clipboard
  // shortcuts through the menu on darwin).
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: send('menu', 'open-file') }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ type: 'separator' }, { role: 'close' }])
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  registerIpc()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { watch } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_NAME = 'Markdown Mermaid'
const MD_EXT = /\.(md|markdown|mdx)$/i
const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] },
  { name: 'Todos los archivos', extensions: ['*'] },
]

const windows = new Set()
const windowState = new WeakMap()

function filePathFromArgv(argv = process.argv) {
  for (const arg of argv) {
    if (arg && !arg.startsWith('-') && MD_EXT.test(arg)) return arg
  }
  return null
}

function getState(win) {
  if (!windowState.has(win)) {
    windowState.set(win, { isDirty: false, closeAfterSave: false, watcher: null, lastSavedAt: 0 })
  }
  return windowState.get(win)
}

function getWinFromEvent(event) {
  try {
    const wc = event.sender
    const w = BrowserWindow.fromWebContents(wc)
    if (w && !w.isDestroyed()) return w
  } catch {}
  return BrowserWindow.getFocusedWindow() || [...windows].find((w) => !w.isDestroyed()) || null
}

function createWindow(initialFile) {
  const win = new BrowserWindow({
    width: 915,
    height: 550,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: APP_NAME,
    backgroundColor: '#17171d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  windows.add(win)
  getState(win)

  win.once('ready-to-show', () => win.show())
  win.on('page-title-updated', (event) => event.preventDefault())
  win.on('closed', () => {
    const state = windowState.get(win)
    if (state?.watcher) {
      try { state.watcher.close() } catch {}
    }
    windowState.delete(win)
    windows.delete(win)
  })
  win.on('close', (event) => onWindowClose(event, win))

  win.webContents.on('console-message', (event) => {
    const { message, level, lineNumber, sourceId } = event
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${lineNumber})`)
  })
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[renderer] did-fail-load ${code} ${description}`)
  })
  win.webContents.once('did-finish-load', () => {
    console.log('[main] renderer cargado')
    if (initialFile) {
      win.webContents.send('file:open-requested', initialFile)
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
    }
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

function watchFile(path, win) {
  const state = getState(win)
  unwatchFile(win)
  if (!path) return
  const dir = dirname(path)
  const base = basename(path)
  try {
    state.watcher = watch(dir, (eventType, filename) => {
      if (typeof filename !== 'string') return
      if (basename(filename) !== base) return
      if (Date.now() - state.lastSavedAt < 800) return
      if (win.isDestroyed()) return
      win.webContents.send('file:changed', { path, eventType })
    })
  } catch {
    state.watcher = null
  }
}

function unwatchFile(win) {
  const state = getState(win)
  if (state.watcher) {
    try { state.watcher.close() } catch {}
    state.watcher = null
  }
}

function setWatchTarget(path, win) {
  const state = getState(win)
  state.lastSavedAt = Date.now()
  watchFile(path, win)
}

function onWindowClose(event, win) {
  const state = getState(win)
  if (!state.isDirty || !win) return
  event.preventDefault()
  const choice = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: ['Guardar', 'Descartar cambios', 'Cancelar'],
    defaultId: 0,
    cancelId: 2,
    message: 'Hay cambios sin guardar',
    detail: '¿Qué deseas hacer con el documento abierto?',
  })
  if (choice === 0) {
    state.closeAfterSave = true
    win.webContents.send('menu:save')
  } else if (choice === 1) {
    state.isDirty = false
    win.destroy()
  }
}

async function openMarkdownFile(filePath) {
  if (!filePath) return null
  try {
    const content = await readFile(filePath, 'utf-8')
    return { path: filePath, content, name: basename(filePath) }
  } catch {
    dialog.showErrorBox(APP_NAME, `No se pudo leer el archivo:\n${filePath}`)
    return null
  }
}

function registerIpc() {
  ipcMain.handle('dialog:open-file', async (event) => {
    const win = getWinFromEvent(event)
    const result = await dialog.showOpenDialog(win, {
      title: 'Abrir archivo Markdown',
      properties: ['openFile'],
      filters: MD_FILTERS,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const file = await openMarkdownFile(result.filePaths[0])
    if (file && win) setWatchTarget(file.path, win)
    return file
  })

  ipcMain.handle('file:open', async (event, filePath) => {
    const win = getWinFromEvent(event)
    const file = await openMarkdownFile(filePath)
    if (file && win) setWatchTarget(file.path, win)
    return file
  })

  ipcMain.handle('file:save', async (event, filePath, content) => {
    const win = getWinFromEvent(event)
    await writeFile(filePath, content, 'utf-8')
    if (win) getState(win).lastSavedAt = Date.now()
    return { ok: true, path: filePath }
  })

  ipcMain.handle('file:save-as', async (event, content, suggestedName = 'documento.md') => {
    const win = getWinFromEvent(event)
    const result = await dialog.showSaveDialog(win, {
      title: 'Guardar como',
      defaultPath: suggestedName,
      filters: MD_FILTERS,
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true, path: null }
    await writeFile(result.filePath, content, 'utf-8')
    if (win) {
      getState(win).lastSavedAt = Date.now()
      setWatchTarget(result.filePath, win)
    }
    return { ok: true, canceled: false, path: result.filePath }
  })

  ipcMain.handle('file:save-blob', async (event, filename, data) => {
    const win = getWinFromEvent(event)
    const ext = extname(filename).replace('.', '')
    const filters = ext
      ? [{ name: 'Documento', extensions: [ext] }]
      : [{ name: 'Todos los archivos', extensions: ['*'] }]
    const result = await dialog.showSaveDialog(win, {
      title: 'Guardar archivo',
      defaultPath: join(app.getPath('downloads'), filename),
      filters,
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true, path: null }
    await writeFile(result.filePath, Buffer.from(data))
    return { ok: true, canceled: false, path: result.filePath }
  })

  ipcMain.on('app:set-watch', (event, path) => {
    const win = getWinFromEvent(event)
    if (win) setWatchTarget(path || null, win)
  })

  ipcMain.handle('app:get-initial-file', (event) => {
    // For the first window the argv is authoritative; for subsequent windows
    // the file is injected via createWindow(initialFile) -> file:open-requested
    return filePathFromArgv(process.argv)
  })

  ipcMain.on('app:set-title', (event, title) => {
    const win = getWinFromEvent(event)
    if (win) win.setTitle(title)
  })

  ipcMain.on('app:set-dirty', (event, dirty) => {
    const win = getWinFromEvent(event)
    if (win) getState(win).isDirty = Boolean(dirty)
  })

  ipcMain.on('app:save-result', (event, payload = {}) => {
    const win = getWinFromEvent(event)
    if (!win) return
    const state = getState(win)
    const { ok } = payload
    if (state.closeAfterSave) {
      state.closeAfterSave = false
      if (ok) {
        state.isDirty = false
        win.close()
      }
    }
  })

  ipcMain.on('app:close-window', (event) => {
    const win = getWinFromEvent(event)
    if (win) win.close()
  })

  ipcMain.handle('dialog:confirm', async (event, message, detail) => {
    const win = getWinFromEvent(event)
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Aceptar', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
      message,
      detail,
    })
    return result.response === 0
  })
}

function sendMenu(action) {
  const win = BrowserWindow.getFocusedWindow() || [...windows].find((w) => !w.isDestroyed())
  if (win) win.webContents.send('menu:' + action)
}

function buildMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nuevo', accelerator: 'CmdOrCtrl+N', click: () => sendMenu('new') },
        { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: () => sendMenu('open') },
        { type: 'separator' },
        { label: 'Guardar', accelerator: 'CmdOrCtrl+S', click: () => sendMenu('save') },
        { label: 'Guardar como…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenu('save-as') },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Vista',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    {
      label: 'Ventana',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = filePathFromArgv(argv)
    // Nuevo requerimiento: cada archivo en ventana distinta
    createWindow(file || null)
  })

  app.whenReady().then(() => {
    registerIpc()
    buildMenu()
    const initialFile = filePathFromArgv(process.argv)
    createWindow(initialFile || null)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    for (const w of [...windows]) {
      const state = windowState.get(w)
      if (state?.watcher) try { state.watcher.close() } catch {}
    }
    if (process.platform !== 'darwin') app.quit()
  })
}

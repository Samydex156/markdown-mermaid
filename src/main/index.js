import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron'
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

let win = null
let isDirty = false
let closeAfterSave = false
let watcher = null
let lastSavedAt = 0

function filePathFromArgv(argv = process.argv) {
  for (const arg of argv) {
    if (arg && !arg.startsWith('-') && MD_EXT.test(arg)) return arg
  }
  return null
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
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

  win.once('ready-to-show', () => win.show())
  win.on('page-title-updated', (event) => event.preventDefault())
  win.on('closed', () => {
    win = null
  })
  win.on('close', onWindowClose)

  win.webContents.on('console-message', (event) => {
    const { message, level, lineNumber, sourceId } = event
    if (level >= 2) console.error(`[renderer] ${message} (${sourceId}:${lineNumber})`)
  })
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`[renderer] did-fail-load ${code} ${description}`)
  })
  win.webContents.once('did-finish-load', () => {
    console.log('[main] renderer cargado')
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      // External links open in the system browser.
      // (opening is handled lazily in the renderer; keep default blocked)
    }
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function watchFile(path) {
  unwatchFile()
  if (!path) return
  const dir = dirname(path)
  const base = basename(path)
  try {
    watcher = watch(dir, (eventType, filename) => {
      if (typeof filename !== 'string') return
      if (basename(filename) !== base) return
      if (Date.now() - lastSavedAt < 800) return
      win?.webContents.send('file:changed', { path, eventType })
    })
  } catch {
    watcher = null
  }
}

function unwatchFile() {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}

function setWatchTarget(path) {
  lastSavedAt = Date.now()
  watchFile(path)
}

function onWindowClose(event) {
  if (!isDirty || !win) return
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
    closeAfterSave = true
    win.webContents.send('menu:save')
  } else if (choice === 1) {
    isDirty = false
    win.close()
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
  ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog(win, {
      title: 'Abrir archivo Markdown',
      properties: ['openFile'],
      filters: MD_FILTERS,
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const file = await openMarkdownFile(result.filePaths[0])
    if (file) setWatchTarget(file.path)
    return file
  })

  ipcMain.handle('file:open', async (_event, filePath) => {
    const file = await openMarkdownFile(filePath)
    if (file) setWatchTarget(file.path)
    return file
  })

  ipcMain.handle('file:save', async (_event, filePath, content) => {
    await writeFile(filePath, content, 'utf-8')
    lastSavedAt = Date.now()
    return { ok: true, path: filePath }
  })

  ipcMain.handle('file:save-as', async (_event, content, suggestedName = 'documento.md') => {
    const result = await dialog.showSaveDialog(win, {
      title: 'Guardar como',
      defaultPath: suggestedName,
      filters: MD_FILTERS,
    })
    if (result.canceled || !result.filePath) return { ok: false, canceled: true, path: null }
    await writeFile(result.filePath, content, 'utf-8')
    lastSavedAt = Date.now()
    setWatchTarget(result.filePath)
    return { ok: true, canceled: false, path: result.filePath }
  })

  ipcMain.on('app:set-watch', (_event, path) => setWatchTarget(path || null))

  ipcMain.handle('app:get-initial-file', () => filePathFromArgv(process.argv))

  ipcMain.on('app:set-title', (_event, title) => {
    if (win) win.setTitle(title)
  })

  ipcMain.on('app:set-dirty', (_event, dirty) => {
    isDirty = Boolean(dirty)
  })

  ipcMain.on('app:save-result', (_event, payload = {}) => {
    const { ok } = payload
    if (closeAfterSave) {
      closeAfterSave = false
      if (ok) {
        isDirty = false
        win?.close()
      }
    }
  })

  ipcMain.on('app:close-window', () => {
    if (win) win.close()
  })

  ipcMain.handle('dialog:confirm', async (_event, message, detail) => {
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

function registerDownloads() {
  session.defaultSession.on('will-download', (event, item, _wc) => {
    const suggested = item.getFilename()
    const ext = extname(suggested).replace('.', '')
    const filters = ext
      ? [{ name: 'Documento', extensions: [ext] }]
      : [{ name: 'Todos los archivos', extensions: ['*'] }]
    dialog
      .showSaveDialog(win, {
        title: 'Guardar archivo',
        defaultPath: join(app.getPath('downloads'), suggested),
        filters,
      })
      .then(({ canceled, filePath }) => {
        if (canceled) {
          item.cancel()
        } else if (filePath) {
          item.setSavePath(filePath)
        }
      })
  })
}

function sendMenu(action) {
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
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
    if (file) win.webContents.send('file:open-requested', file)
  })

  app.whenReady().then(() => {
    registerIpc()
    registerDownloads()
    buildMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    unwatchFile()
    if (process.platform !== 'darwin') app.quit()
  })
}

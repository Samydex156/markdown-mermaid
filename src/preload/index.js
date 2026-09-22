import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  openFile: (path) => ipcRenderer.invoke('file:open', path),
  saveFile: (path, content) => ipcRenderer.invoke('file:save', path, content),
  saveFileAs: (content, suggestedName) => ipcRenderer.invoke('file:save-as', content, suggestedName),
  saveFileWithDialog: (filename, data) => ipcRenderer.invoke('file:save-blob', filename, data),
  getInitialFile: () => ipcRenderer.invoke('app:get-initial-file'),
  confirm: (message, detail) => ipcRenderer.invoke('dialog:confirm', message, detail),
  windowsTtsSpeak: (text, voiceName, rate) => ipcRenderer.invoke('tts:windows-speak', text, voiceName, rate),
  windowsTtsStop: () => ipcRenderer.invoke('tts:windows-stop'),
  windowsTtsVoices: () => ipcRenderer.invoke('tts:windows-voices'),

  setTitle: (title) => ipcRenderer.send('app:set-title', title),
  setDirty: (dirty) => ipcRenderer.send('app:set-dirty', Boolean(dirty)),
  setWatch: (path) => ipcRenderer.send('app:set-watch', path),
  notifySaveResult: (payload) => ipcRenderer.send('app:save-result', payload),
  closeWindow: () => ipcRenderer.send('app:close-window'),

  onOpenRequested: (callback) => {
    const listener = (_event, path) => callback(path)
    ipcRenderer.on('file:open-requested', listener)
    return () => ipcRenderer.removeListener('file:open-requested', listener)
  },
  onFileChanged: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('file:changed', listener)
    return () => ipcRenderer.removeListener('file:changed', listener)
  },
  onMenuAction: (action, callback) => {
    const channel = `menu:${action}`
    const listener = () => callback()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

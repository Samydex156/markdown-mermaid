<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import MarkdownInput from './components/MarkdownInput.vue'
import MarkdownViewer from './components/MarkdownViewer.vue'
import { DEMO_MARKDOWN } from './lib/examples'
import { initializeMermaid } from './lib/mermaidRenderer'
import { markdownToDocx } from './lib/markdownToDocx'
import { downloadBlob } from './lib/diagramDownload'
import { isSupported as isTtsSupported, getVoices as getTtsVoices, speak as ttsSpeak, stop as ttsStop, pause as ttsPause, resume as ttsResume, setStateListener as setTtsListener } from './lib/tts'

const APP_NAME = 'Markdown Mermaid'
const api = window.electronAPI

const markdown = ref(DEMO_MARKDOWN)
const mode = ref('preview')
const generating = ref(false)
const currentPath = ref(null)
const fileName = ref('Ejemplo')
const dirty = ref(false)
let savedContent = DEMO_MARKDOWN

// TTS Windows (SAPI via Web Speech)
const ttsVoices = ref([])
const selectedVoice = ref('')
const ttsRate = ref(1)
const ttsState = ref('idle')
const ttsEngine = ref('web')
const ttsSupported = isTtsSupported()

function updateTitle() {
  const marker = dirty.value ? ' ●' : ''
  api.setTitle(`${fileName.value}${marker} - ${APP_NAME}`)
}

function setEditorDirty(value) {
  dirty.value = value
  api.setDirty(value)
}

function refreshTtsVoices() {
  const voices = getTtsVoices()
  ttsVoices.value = voices
  if (!selectedVoice.value && voices.length) {
    const es = voices.find(v => v.lang.toLowerCase().startsWith('es'))
    selectedVoice.value = es?.voiceURI || voices[0]?.voiceURI || ''
  }
}

function getTextToRead() {
  // si hay selección en el editor, leer solo selección (útil en Windows para escuchar fragmento)
  const ta = document.querySelector('.editor')
  if (ta && ta.selectionStart !== ta.selectionEnd) {
    return ta.value.substring(ta.selectionStart, ta.selectionEnd)
  }
  return markdown.value
}

async function handleTtsToggle() {
  if (ttsState.value === 'speaking') {
    if (ttsEngine.value === 'windows' && api.windowsTtsStop) {
      await api.windowsTtsStop()
      ttsState.value = 'idle'
    } else {
      ttsPause()
    }
    return
  }
  if (ttsState.value === 'paused') {
    if (ttsEngine.value === 'windows') {
      // Windows SAPI no soporta resume nativo; reinicia lectura
      await handleTtsSpeak()
    } else {
      ttsResume()
    }
    return
  }
  await handleTtsSpeak()
}

async function handleTtsSpeak() {
  const text = getTextToRead()
  if (!text || !text.trim()) return
  if (ttsEngine.value === 'windows' && api.windowsTtsSpeak) {
    ttsState.value = 'speaking'
    try {
      const voice = ttsVoices.value.find(v => v.voiceURI === selectedVoice.value)
      const voiceName = voice ? voice.name : undefined
      const { ok } = await api.windowsTtsSpeak(text, voiceName, ttsRate.value)
      ttsState.value = 'idle'
      if (!ok) alert('No se pudo iniciar la lectura Windows (SAPI). Verifique voces instaladas.')
    } catch (e) {
      console.error('[tts windows]', e)
      ttsState.value = 'idle'
    }
    return
  }
  // Web Speech (SAPI5 en Windows vía Chromium)
  const voice = ttsVoices.value.find(v => v.voiceURI === selectedVoice.value)
  ttsSpeak(text, {
    voiceURI: selectedVoice.value,
    lang: voice?.lang,
    rate: ttsRate.value,
    onEnd: () => { ttsState.value = 'idle' },
    onError: () => { ttsState.value = 'idle' },
  })
}

function handleTtsStop() {
  if (ttsEngine.value === 'windows' && api.windowsTtsStop) {
    void api.windowsTtsStop()
    ttsState.value = 'idle'
  } else {
    ttsStop()
  }
}

function loadFile(file) {
  if (!file) return
  handleTtsStop()
  savedContent = file.content
  markdown.value = file.content
  currentPath.value = file.path
  fileName.value = file.name
  setEditorDirty(false)
  api.setWatch(file.path)
}

async function confirmDiscard() {
  if (!dirty.value) return true
  return api.confirm('Cambios sin guardar', 'El documento actual tiene cambios sin guardar. ¿Deseas descartarlos y continuar?')
}

async function newDocument() {
  if (!(await confirmDiscard())) return
  handleTtsStop()
  savedContent = ''
  markdown.value = ''
  currentPath.value = null
  fileName.value = 'Sin título'
  setEditorDirty(false)
  api.setWatch(null)
}

async function restoreExample() {
  if (!(await confirmDiscard())) return
  handleTtsStop()
  savedContent = DEMO_MARKDOWN
  markdown.value = DEMO_MARKDOWN
  currentPath.value = null
  fileName.value = 'Ejemplo'
  setEditorDirty(false)
  api.setWatch(null)
}

async function openDialog() {
  if (!(await confirmDiscard())) return
  const file = await api.openFileDialog()
  if (file) loadFile(file)
}

async function openRequested(path) {
  if (!(await confirmDiscard())) return
  const file = await api.openFile(path)
  if (file) loadFile(file)
}

async function save() {
  try {
    if (currentPath.value) {
      const result = await api.saveFile(currentPath.value, markdown.value)
      api.notifySaveResult({ ok: result.ok })
      if (result.ok) {
        savedContent = markdown.value
        setEditorDirty(false)
      }
    } else {
      await saveAs()
    }
  } catch (error) {
    console.error('No se pudo guardar el archivo:', error)
    api.notifySaveResult({ ok: false })
    alert('No se pudo guardar el archivo')
  }
}

async function saveAs() {
  const suggested = fileName.value.endsWith('.md') ? fileName.value : `${fileName.value}.md`
  try {
    const result = await api.saveFileAs(markdown.value, suggested)
    api.notifySaveResult({ ok: result.ok })
    if (result.ok) {
      savedContent = markdown.value
      currentPath.value = result.path
      fileName.value = result.path.split(/[\\/]/).pop()
      setEditorDirty(false)
    }
  } catch (error) {
    console.error('No se pudo guardar el archivo:', error)
    api.notifySaveResult({ ok: false })
    alert('No se pudo guardar el archivo')
  }
}

async function downloadWord() {
  if (generating.value) return
  generating.value = true
  try {
    const base = fileName.value.replace(/\.(md|markdown|mdx)$/i, '')
    const blob = await markdownToDocx(markdown.value)
    await downloadBlob(blob, `${base}.docx`)
  } catch (error) {
    console.error('No se pudo generar el documento Word:', error)
    alert('No se pudo generar el documento Word')
  } finally {
    generating.value = false
  }
}

function onFileChanged({ path }) {
  if (!currentPath.value || path !== currentPath.value) return
  const message = dirty.value
    ? 'El archivo cambió en disco y tienes cambios sin guardar'
    : 'El archivo cambió en disco'
  const detail = '¿Recargar el archivo desde disco?'
  void api.confirm(message, detail).then((ok) => {
    if (ok) void api.openFile(path).then((file) => {
      if (file) loadFile(file)
    })
  })
}

const unsubscribers = []
const menuActions = { new: newDocument, open: openDialog, save, 'save-as': saveAs }

function onKeydown(event) {
  if (!(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()
  if (key === 'l' && event.shiftKey) {
    event.preventDefault()
    if (ttsSupported) void handleTtsToggle()
    return
  }
  if (key === 's' && event.shiftKey) {
    event.preventDefault()
    void saveAs()
  } else if (key === 's') {
    event.preventDefault()
    void save()
  } else if (key === 'o') {
    event.preventDefault()
    void openDialog()
  } else if (key === 'n') {
    event.preventDefault()
    newDocument()
  }
}

onMounted(() => {
  initializeMermaid()
  window.addEventListener('keydown', onKeydown)
  // TTS setup (Windows SAPI voces)
  if (ttsSupported) {
    setTtsListener((s) => { ttsState.value = s })
    refreshTtsVoices()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = refreshTtsVoices
      // fallback si voces aún no cargadas
      setTimeout(refreshTtsVoices, 500)
    }
    // cargar voces Windows SAPI adicionales si engine windows
    if (api.windowsTtsVoices) {
      void api.windowsTtsVoices().then(() => refreshTtsVoices())
    }
  }
  unsubscribers.push(api.onOpenRequested((path) => void openRequested(path)))
  unsubscribers.push(api.onFileChanged(onFileChanged))
  for (const [action, handler] of Object.entries(menuActions)) {
    unsubscribers.push(api.onMenuAction(action, handler))
  }
  void api.getInitialFile().then((path) => {
    if (path) void openRequested(path)
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  handleTtsStop()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = null
  }
  unsubscribers.forEach((unsub) => unsub())
})

watch([fileName, dirty], updateTitle)
watch(markdown, (val) => {
  const shouldBeDirty = val !== savedContent
  if (shouldBeDirty !== dirty.value) setEditorDirty(shouldBeDirty)
})

</script>

<template>
  <div class="app">
    <header class="toolbar">
      <div class="toolbar-title">
        <h1 class="title">Markdown Mermaid</h1>
        <span class="doc-name" :class="{ dirty }">{{ fileName }}<span v-if="dirty" class="dirty-dot">●</span></span>
      </div>
      <div class="toolbar-actions">
        <button class="btn" @click="newDocument">Nuevo</button>
        <button class="btn" @click="openDialog">Abrir</button>
        <button class="btn" :disabled="!dirty" @click="save">Guardar</button>
        <button class="btn" @click="saveAs">Guardar como</button>
        <button class="btn btn-accent" :disabled="generating" @click="downloadWord">
          {{ generating ? 'Generando…' : 'Descargar Word' }}
        </button>
        <button class="btn" @click="restoreExample">Restaurar ejemplo</button>
        <div class="segmented" role="group" aria-label="Modo de vista">
          <button
            v-for="m in ['editor', 'split', 'preview']"
            :key="m"
            class="seg-btn"
            :class="{ active: mode === m }"
            @click="mode = m"
          >
            {{ m === 'editor' ? 'Editor' : m === 'split' ? 'Split' : 'Vista' }}
          </button>
        </div>
      </div>
      <!-- Barra TTS Windows (SAPI) -->
      <div v-if="ttsSupported" class="toolbar-tts">
        <span class="tts-label">Lectura:</span>
        <button
          class="btn btn-tts"
          :class="{ active: ttsState === 'speaking' }"
          :title="ttsState === 'speaking' ? 'Pausar (Ctrl+Shift+L)' : ttsState === 'paused' ? 'Reanudar (Ctrl+Shift+L)' : 'Leer en voz alta (Ctrl+Shift+L)'"
          @click="handleTtsToggle"
        >
          <span v-if="ttsState === 'speaking'">⏸ Pausar</span>
          <span v-else-if="ttsState === 'paused'">▶ Reanudar</span>
          <span v-else>▶ Leer</span>
        </button>
        <button class="btn btn-tts" :disabled="ttsState === 'idle'" title="Detener lectura" @click="handleTtsStop">⏹ Detener</button>
        <select v-model="selectedVoice" class="tts-select" title="Voz">
          <option v-for="v in ttsVoices" :key="v.voiceURI" :value="v.voiceURI">{{ v.name }} ({{ v.lang }})</option>
        </select>
        <label class="tts-rate-label" title="Velocidad">Vel:
          <input v-model.number="ttsRate" type="range" min="0.5" max="2" step="0.1" class="tts-rate" />
          <span class="tts-rate-val">{{ ttsRate.toFixed(1) }}x</span>
        </label>
        <select v-model="ttsEngine" class="tts-select tts-engine" title="Motor">
          <option value="web">Web (SAPI)</option>
          <option value="windows">Windows SAPI</option>
        </select>
        <span v-if="ttsState !== 'idle'" class="tts-status">{{ ttsState === 'speaking' ? '🔊 Reproduciendo' : '⏸ Pausado' }}</span>
      </div>
    </header>

    <main class="layout" :class="`mode-${mode}`">
      <section v-show="mode === 'editor' || mode === 'split'" class="panel panel-editor">
        <MarkdownInput v-model="markdown" @loaded="loadFile" @dirty="() => { if (!dirty) setEditorDirty(true) }" />
      </section>
      <section v-show="mode === 'preview' || mode === 'split'" class="panel panel-preview">
        <MarkdownViewer :source="markdown" />
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100svh;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}

.toolbar-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--text-h);
  white-space: nowrap;
}

.doc-name {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

.doc-name.dirty {
  color: var(--accent);
}

.dirty-dot {
  margin-left: 4px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--code-bg);
  color: var(--text-h);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s;
}

.btn:hover {
  border-color: var(--accent);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-accent {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.btn-accent:hover {
  border-color: var(--accent);
  filter: brightness(1.05);
}

.segmented {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.seg-btn {
  padding: 7px 14px;
  border: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.seg-btn + .seg-btn {
  border-left: 1px solid var(--border);
}

.seg-btn.active {
  background: var(--accent);
  color: #fff;
}

.toolbar-tts {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg);
  width: 100%;
}
.tts-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-h);
}
.btn-tts.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.tts-select {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--code-bg);
  color: var(--text-h);
  font-size: 13px;
  max-width: 220px;
}
.tts-engine {
  max-width: 130px;
}
.tts-rate-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text);
}
.tts-rate {
  width: 90px;
}
.tts-rate-val {
  min-width: 32px;
  font-family: var(--mono);
  font-size: 12px;
}
.tts-status {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
}

.layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.panel {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.panel-editor {
  border-right: 1px solid var(--border);
}

.mode-editor .panel-preview,
.mode-preview .panel-editor {
  display: none;
}

.mode-editor,
.mode-preview {
  grid-template-columns: 1fr;
}
</style>

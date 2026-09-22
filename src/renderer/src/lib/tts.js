// TTS Web Speech + utilidades para Windows (SAPI5 via SpeechSynthesis)
// Solo para Windows: usa voces instaladas SAPI5 expuestas por Chromium

let currentUtterance = null
let onStateChange = null

function stripMarkdown(md) {
  if (!md) return ''
  let text = md
  // quitar fences mermaid y code blocks
  text = text.replace(/```mermaid[\s\S]*?```/gi, ' Diagrama Mermaid. ')
  text = text.replace(/```[\s\S]*?```/g, ' ')
  // inline code
  text = text.replace(/`[^`]*`/g, (m) => m.slice(1, -1))
  // imágenes ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  // links [txt](url) -> txt
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // headings
  text = text.replace(/^#{1,6}\s*/gm, '')
  // blockquotes
  text = text.replace(/^>\s*/gm, '')
  // listas
  text = text.replace(/^[\s]*[-*+]\s+/gm, '')
  text = text.replace(/^\s*\d+\.\s+/gm, '')
  // bold/italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/_([^_]+)_/g, '$1')
  // tablas: quitar pipes
  text = text.replace(/\|/g, ' ')
  // hr
  text = text.replace(/^[-*_]{3,}\s*$/gm, '')
  // html tags
  text = text.replace(/<[^>]*>/g, ' ')
  // colapsar espacios
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

function getVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return []
  return window.speechSynthesis.getVoices()
}

function getSpanishVoices() {
  return getVoices().filter(v => v.lang.toLowerCase().startsWith('es'))
}

function isSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

function stop() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  currentUtterance = null
  if (onStateChange) onStateChange('idle')
}

function pause() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
    window.speechSynthesis.pause()
    if (onStateChange) onStateChange('paused')
  }
}

function resume() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume()
    if (onStateChange) onStateChange('speaking')
  }
}

function speak(text, { voiceURI, lang, rate = 1, pitch = 1, volume = 1, onEnd, onError, onBoundary } = {}) {
  if (!isSupported()) {
    if (onError) onError(new Error('TTS no soportado en este entorno'))
    return null
  }
  stop()

  const clean = stripMarkdown(text)
  if (!clean) {
    if (onError) onError(new Error('No hay texto para leer'))
    return null
  }

  // Chunking: SpeechSynthesis puede fallar con textos > 3000 chars en Windows SAPI
  // Dividimos en oraciones/bloques de ~2500 chars y encadenamos
  const chunks = chunkText(clean, 2500)
  let idx = 0

  const speakNext = () => {
    if (idx >= chunks.length) {
      currentUtterance = null
      if (onStateChange) onStateChange('idle')
      if (onEnd) onEnd()
      return
    }
    const chunk = chunks[idx++]
    const u = new SpeechSynthesisUtterance(chunk)
    currentUtterance = u
    const voices = getVoices()
    let voice = null
    if (voiceURI) voice = voices.find(v => v.voiceURI === voiceURI) || null
    if (!voice && lang) voice = voices.find(v => v.lang === lang) || null
    if (!voice) {
      // priorizar voces es-ES / es-MX en Windows
      const es = getSpanishVoices()
      voice = es[0] || voices[0] || null
    }
    if (voice) u.voice = voice
    u.lang = voice?.lang || lang || 'es-ES'
    u.rate = rate
    u.pitch = pitch
    u.volume = volume
    u.onstart = () => { if (onStateChange) onStateChange('speaking') }
    u.onpause = () => { if (onStateChange) onStateChange('paused') }
    u.onresume = () => { if (onStateChange) onStateChange('speaking') }
    u.onend = () => { speakNext() }
    u.onerror = (e) => {
      console.error('[tts] error', e)
      // intentar siguiente chunk aun con error
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        speakNext()
      } else {
        currentUtterance = null
        if (onStateChange) onStateChange('idle')
        if (onError) onError(e)
      }
    }
    if (onBoundary) u.onboundary = onBoundary
    window.speechSynthesis.speak(u)
  }

  speakNext()
  return true
}

function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text]
  const chunks = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length)
    // buscar punto cercano para corte limpio
    if (end < text.length) {
      const slice = text.slice(start, end)
      const lastDot = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('。'), slice.lastIndexOf('! '), slice.lastIndexOf('? '))
      if (lastDot > maxLen * 0.5) end = start + lastDot + 1
    }
    chunks.push(text.slice(start, end).trim())
    start = end
  }
  return chunks.filter(Boolean)
}

function setStateListener(cb) {
  onStateChange = cb
}

function getState() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return 'idle'
  const s = window.speechSynthesis
  if (s.paused) return 'paused'
  if (s.speaking) return 'speaking'
  return 'idle'
}

export {
  stripMarkdown,
  getVoices,
  getSpanishVoices,
  isSupported,
  speak,
  stop,
  pause,
  resume,
  getState,
  setStateListener,
  chunkText,
}

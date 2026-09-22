# Arquitectura

## Visión general

Aplicación de **escritorio para Windows** construida con Electron, con tres procesos clásicos y soporte **multi-ventana** + **TTS**:

```
┌───────────────────────────  Proceso principal (Node)  ───────────────────────────┐
│  src/main/index.js                                                                │
│  Set<BrowserWindow> · WeakMap<win,{isDirty,watcher,lastSavedAt,ttsProcess}>       │
│  Multi-ventana · IPC · fs (leer/guardar) · watcher · TTS SAPI · descargas · menú │
└───────────────▲───────────────────────────────┬───────────────────────────────────┘
                │ ipcMain (handle/on)           │ webContents.send (eventos)
┌───────────────┴────────────┐   ┌───────────────▼───────────────────────────────────┐
│  src/preload/index.js       │   │              Renderer (Chromium + Vue)             │
│  contextBridge · webUtils  │──▶│  src/renderer/ → App.vue · MarkdownInput.vue      │
│  expone window.electronAPI │   │  MarkdownViewer.vue · lib/ (markdown, mermaid,    │
│  + TTS windows IPC         │   │  diagramDownload, markdownToDocx, tts, examples)  │
└────────────────────────────┘   └────────────────────────────────────────────────────┘
```

Todo el procesamiento pesado (Markdown → HTML, Mermaid → SVG, Markdown → docx, TTS stripMarkdown/chunking) ocurre en el **renderer**; el proceso principal solo hace **I/O de ficheros**, diálogos, gestión de ventanas y **SAPI PowerShell** por ventana.

## Estructura de directorios

```
vue-mermaid-viewer-electron/
├── electron.vite.config.js      # Build de main/preload/renderer (Vite 7)
├── electron-builder.yml         # Empaquetado NSIS + fileAssociations
├── package.json                 # "main": ./out/main/index.js
├── build/                       # icon.ico / icon.png (generados)
├── scripts/generate-icon.js     # Genera el icono placeholder
├── docs/                        # Documentación
└── src/
    ├── main/index.js            # Proceso principal (multi-ventana)
    ├── preload/index.js         # contextBridge + webUtils.getPathForFile + TTS
    └── renderer/                # App Vue (Electron renderer)
        ├── index.html           # CSP + punto de montaje
        ├── public/
        └── src/
            ├── main.js          # Punto de entrada Vue
            ├── App.vue          # Toolbar, layout split, estado del documento y barra TTS
            ├── style.css        # Variables de tema, markdown-body, diagramas
            ├── components/
            │   ├── MarkdownViewer.vue   # v-html + render de diagramas
            │   └── MarkdownInput.vue    # Editor con debounce + drag & drop + evento dirty
            └── lib/
                ├── markdown.js          # markdown-it + DOMPurify + fence mermaid
                ├── mermaidRenderer.js   # Render asíncrono de diagramas + toolbar SVG/PNG
                ├── diagramDownload.js   # Exportación SVG/PNG + rasterizado a Blob
                ├── markdownToDocx.js    # Conversión a documento Word (.docx)
                ├── tts.js               # TTS Web Speech + stripMarkdown + chunking 2500
                └── examples.js          # Documento de ejemplo precargado
```

## Flujos de datos

### Apertura de un archivo

1. **Doble clic en el explorador**: Windows lanza la app con la ruta como argumento.
   - Si la app no está abierta: `app:get-initial-file` devuelve la ruta extraída de `process.argv` (`filePathFromArgv`) y el renderer la abre en la primera ventana.
   - Si ya está abierta: el evento `second-instance` crea **una nueva ventana** con `createWindow(file)` y tras `did-finish-load` envía `file:open-requested` a esa ventana.
2. **Menú Abrir / Ctrl+O**: `dialog:open-file` muestra el diálogo nativo y lee el fichero en la ventana enfocada (`getWinFromEvent`).
3. **Drag & drop**: `MarkdownInput.vue` obtiene la ruta real con `electronAPI.getPathForFile(file)` (vía `webUtils`) y llama a `file:open`.
4. En todos los casos se valida la extensión (`md|markdown|mdx`) y el renderer hace `loadFile(file)` → actualiza `markdown`, `currentPath`, `fileName`, `savedContent`, limpia `dirty`, avisa al main (`set-watch`, `set-dirty`) y detiene TTS si estaba reproduciendo.
5. El **watcher** por ventana (`watchFile(path, win)` en `src/main/index.js`) observa el directorio del archivo y emite `file:changed` solo a su ventana si cambia fuera de la app (con recarga opcional y aviso si hay cambios sin guardar). `lastSavedAt` por ventana suprime eventos del propio guardado.

### Guardado

- **Ctrl+S / menú Guardar / botón**: si hay `currentPath` → `file:save` escribe el contenido; si no → `file:save-as` con diálogo nativo. `App.vue` mantiene `let savedContent` y `watch(markdown, val !== savedContent → setEditorDirty)` + evento `dirty` inmediato desde `MarkdownInput.vue` para habilitar Guardar al primer keystroke (antes del debounce 300ms). Tras éxito actualiza `savedContent = markdown.value`.
- El renderer notifica el resultado con `app:save-result`; si el guardado vino de un cierre solicitado por el main (diálogo "Guardar" al cerrar ventana con cambios), el main completa el cierre solo de esa ventana (`state.closeAfterSave` por ventana).
- `lastSavedAt` por ventana suprime los eventos del watcher disparados por el propio guardado (evita bucles).

### Render del documento (renderer, heredado del proyecto base)

1. `MarkdownViewer.vue` calcula `html = renderMarkdown(source)`.
2. `markdown.js`: `markdown-it` (html, linkify, highlight.js) con fence custom para bloques `mermaid`; el HTML se sanea con `DOMPurify.sanitize` antes del `v-html`.
3. En `onMounted` y en cada cambio de `source` (`watch` + `flush: 'post'`) se llama a `renderDiagrams(container)`:
   - Agrupa `pre.mermaid` por fuente (deduplicación) y llama a `mermaid.render` por fuente única.
   - Reemplaza cada bloque por su SVG y añade el toolbar de descarga (SVG/PNG).
   - Si falla, muestra `.mermaid-error` sin romper el resto. Un token de render descarta resultados obsoletos.

### TTS — Lectura en voz alta (solo Windows)

- **Renderer `lib/tts.js`**: `stripMarkdown` limpia fences, inline code, links, tablas, html; `chunkText(2500)` divide para SAPI; `getVoices/getSpanishVoices` prioriza `es-ES/MX`; `speak(text,{voiceURI,rate})` encadena `SpeechSynthesisUtterance` por chunks con `onend` a siguiente chunk; `pause/resume/stop` mapean a `speechSynthesis`.
- **Main SAPI fallback**: `windowsTtsSpeak(win,text,voiceName,rate)` vía `cp.spawn('powershell.exe', 'Add-Type System.Speech; $s.SelectVoice; $s.Rate; $s.Speak')`, `sapiRate = ((rate-1)*10)` (-10 a 10), `ttsProcess` por ventana, `killTtsProcess` en `Detener/cambio de archivo/cierre`; IPC `tts:windows-speak/stop/voices`.
- **Preload**: expone `windowsTtsSpeak/windowsTtsStop/windowsTtsVoices` en `window.electronAPI`.
- **App.vue**: barra `toolbar-tts` con `▶ Leer/⏸ Pausar/▶ Reanudar/⏹ Detener`, `<select>` voces, slider velocidad `0.5-2x`, selector motor `web/windows`, `Ctrl+Shift+L`, lectura de selección (`document.querySelector('.editor').selection`) o documento completo. `handleTtsStop` se invoca en `loadFile/newDocument/restoreExample/onUnmounted`. Solo streaming en memoria, sin archivos temporales.

### Descargas (Word, SVG, PNG)

- Los módulos de renderer generan el blob y lo envían al proceso principal con `downloadBlob` (`lib/diagramDownload.js`), que delega en `electronAPI.saveFileWithDialog` (IPC `file:save-blob`).
- El main muestra **un único** `dialog.showSaveDialog` nativo y escribe el archivo con `writeFile`; si el usuario cancela, devuelve `{ ok: false }` y no escribe nada.
- En un entorno sin `electronAPI` (navegador) `downloadBlob` cae en el `<a download>` con `blob:`.
- Este diseño sustituye al antiguo `session.on('will-download')`, que abría la ventana de guardado **dos veces**.

### Cierre con cambios sin guardar

1. El renderer sincroniza el estado por ventana con `app:set-dirty(bool)` y el título con `app:set-title`.
2. En `win.on('close')`, si `state.isDirty` para esa ventana, el main muestra un diálogo nativo: **Guardar / Descartar / Cancelar**.
3. "Guardar" → envía `menu:save` y espera `app:save-result` para cerrar solo esa ventana; "Descartar" → `win.destroy()`; "Cancelar" → no hace nada. `app:close-window` cierra la ventana enfocada.

## Decisiones técnicas clave

| Decisión                              | Motivo                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| Electron + electron-vite              | Un solo bundler para main/preload/renderer con HMR en dev.          |
| Lógica de render en el renderer       | Mermaid, docx y TTS strip requieren DOM/canvas; el main solo hace I/O y SAPI. |
| `contextIsolation` + preload          | Aislamiento del renderer; IPC acotado por `contextBridge`.          |
| `webUtils.getPathForFile` en preload  | Reemplaza al deprecado `File.path` para drag & drop con rutas reales.|
| `sandbox: false`                      | Requerido para preload ESM (`index.mjs`) con `type: module`.        |
| CSP en `index.html`                   | `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src` con `data:/blob:`; bloquea eval y fuentes externas. |
| Multi-ventana + `second-instance` → `createWindow(file)` | Cada `.md` en ventana distinta con `Set/WeakMap` por ventana (watcher, dirty, ttsProcess aislados). |
| `savedContent` + `watch(markdown)` + `emit('dirty')` | Botón Guardar habilitado al primer keystroke sin esperar debounce; evita `dirty` siempre falso. |
| `lastSavedAt` por ventana             | Suprime eventos del watcher provocados por el propio guardado.      |
| TTS Web Speech + SAPI PowerShell      | Web Speech usa SAPI5 en Windows sin deps; PowerShell fallback por ventana sin archivos temporales, solo streaming. |
| IPC `file:save-blob` (renderer → main) | Un único diálogo nativo por descarga; el main escribe el archivo (evita el doble diálogo de `will-download`). |
| NSIS `perMachine: true`               | Permite que electron-builder registre `fileAssociations` de forma fiable en Windows. |
| Renderer deps en `devDependencies`    | Se bundlean en `out/renderer`; el asar queda sin `node_modules` (instalador ligero). |

## Seguridad

- **Renderer aislado**: `contextIsolation: true`, `nodeIntegration: false`; solo se expone `window.electronAPI` (preload).
- **CSP**: sin `unsafe-eval`, sin fuentes externas; estilos inline permitidos (necesario para Mermaid).
- **XSS en el documento**: el HTML generado por markdown-it pasa por `DOMPurify.sanitize` antes del `v-html`.
- **XSS en diagramas**: `securityLevel: 'strict'` en Mermaid.
- **Navegación**: `setWindowOpenHandler` deniega ventanas nuevas; los enlaces externos quedan bloqueados por defecto.
- **Carga de archivos**: solo extensiones `md`, `markdown`, `mdx`.
- **TTS**: `escapePsText` dobla `'` para PowerShell; texto solo en memoria, no `SetOutputToWaveFile`.

## Notas

- Módulos **ESM** (`"type": "module"`) en main y preload. Electron requiere extensión `.mjs` en el preload ESM (el main lo referencia como `../preload/index.mjs`).
- `electron-vite` emite `out/main/index.js` (13.20kB), `out/preload/index.mjs` (2.07kB) y `out/renderer/`.
- `electron-builder` empaqueta solo `out/**` (ver `files` en `electron-builder.yml`).
- Ventana por defecto de **915×550** (mínima 720×480); la app arranca en **modo Vista** (`mode: 'preview'`, configurable con el toggle Editor/Split/Vista).
- El editor usa `white-space: pre-wrap` (el texto se ajusta al ancho del panel) y el modo Vista ocupa todo el ancho de la ventana (`max-width: none`).
- TTS requiere voces SAPI instaladas; `speechSynthesis.getVoices()` expone `Microsoft Sabina` etc. No genera archivos wav.

## Posibles evoluciones

- Lazy-loading de mermaid (import dinámico) para reducir el bundle inicial.
- Pestañas para varios documentos en una ventana (alternativa a multi-ventana).
- Resaltado de sintaxis en el editor.
- Persistencia del documento en `localStorage` / archivos recientes.
- Exportación del documento completo a HTML/PDF y export de audio TTS a wav.
- Registro de la asociación de archivos también en desarrollo (para pruebas sin instalar).

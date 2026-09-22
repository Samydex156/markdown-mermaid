# Plan de implementación: Markdown Mermaid (Electron)

> Aplicación de escritorio para Windows construida con Electron + Vue 3 + Vite.
> Reutiliza la lógica de visualización/edición/exportación de `vue-mermaid-viewer-js`.

## Objetivo

Convertir el proyecto `vue-mermaid-viewer-electron` (Vue 3 + Vite vacío) en una app Electron de escritorio para Windows que:

- Abre `.md` / `.markdown` / `.mdx` por **doble clic en el explorador** (asociación de archivos, cada archivo en ventana nueva), menú Abrir o drag & drop.
- Muestra **split editor + vista renderizada** con diagramas Mermaid (lógica reutilizada de `vue-mermaid-viewer-js`).
- Edita y **guarda** (Ctrl+S / Guardar como / botón) con habilitación inmediata del botón.
- **Exporta a Word** (misma lógica `markdownToDocx`).
- **Lee en voz alta** el contenido con TTS Windows (SAPI).

## Stack y versiones (verificadas en npm, 2026)

| Paquete            | Versión  | Rol                                     |
| ------------------ | -------- | --------------------------------------- |
| electron           | ^43      | Runtime de escritorio                    |
| electron-vite      | ^5       | Build main/preload/renderer + HMR        |
| electron-builder   | ^26      | Empaquetado, NSIS, fileAssociations      |
| vue                | ^3.5     | UI (renderer)                            |
| markdown-it        | ^15      | Render de markdown                       |
| mermaid            | ^11      | Diagramas a SVG                          |
| highlight.js       | ^11      | Resaltado de sintaxis                    |
| dompurify          | ^3       | Saneado anti-XSS del HTML                |
| docx               | ^9       | Generación de .docx                      |

Node 24 / npm 12 (compatibles).

## Estructura de destino

```
vue-mermaid-viewer-electron/
├── electron.vite.config.js          # configuración main/preload/renderer
├── electron-builder.yml             # empaquetado + fileAssociations
├── package.json                     # scripts dev/build + "main": ./out/main/index.js
├── build/icon.png + icon.ico        # icono placeholder
├── scripts/generate-icon.js         # genera icono placeholder (sharp + png-to-ico)
├── docs/plan-implementacion.md      # este documento
├── src/
│   ├── main/index.js                # proceso principal (multi-ventana, IPC, fs, watcher, TTS SAPI, descargas)
│   ├── preload/index.js             # contextBridge + webUtils.getPathForFile + TTS
│   └── renderer/                    # app Vue (movida desde src/ actual)
│       ├── index.html
│       └── src/
│           ├── main.js / style.css
│           ├── App.vue              # toolbar + save/new/open + estado dirty + barra TTS
│           ├── components/
│           │   ├── MarkdownInput.vue   # diálogo nativo + drop con ruta real + evento dirty
│           │   └── MarkdownViewer.vue  # igual que el proyecto base
│           └── lib/
│               ├── markdown.js
│               ├── mermaidRenderer.js
│               ├── diagramDownload.js
│               ├── markdownToDocx.js
│               ├── tts.js              # TTS Web Speech + stripMarkdown + chunking
│               └── examples.js
```

## Componentes clave

### 1. Proceso principal (`src/main/index.js`)

- `BrowserWindow` seguro: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, preload. Carga `ELECTRON_RENDERER_URL` en dev y `out/renderer/index.html` en producción. CSP en el index.html.
- **Multi-ventana**: `Set<BrowserWindow>` + `WeakMap<win,{isDirty,watcher,lastSavedAt,ttsProcess}>`; `createWindow(initialFile)` crea ventana independiente, `second-instance` hace `createWindow(file||null)` y `did-finish-load → file:open-requested`; helpers `getState/getWinFromEvent/watchFile(path,win)/setWatchTarget/onWindowClose` por ventana.
- **Parseo de argv**: al arrancar, busca el primer argumento con extensión `.md|markdown|mdx`.
- **IPC** (`ipcMain.handle` / `ipcMain.on`):
  - `dialog:open-file` → diálogo nativo + lectura (ventana enfocada).
  - `file:open(path)` → `fs.readFile`, devuelve `{ path, content, name }`.
  - `file:save(path, content)` → `fs.writeFile` + `lastSavedAt` por ventana.
  - `file:save-as(content, suggested)` → `dialog.showSaveDialog` + escritura + `setWatchTarget`.
  - `file:save-blob(filename, data)` → `dialog.showSaveDialog` + escritura del blob (Word/SVG/PNG).
  - `tts:windows-speak/stop/voices` → SAPI vía `cp.spawn('powershell.exe','System.Speech')` por ventana.
  - `app:get-initial-file` → ruta desde argv.
  - `set-title` / `set-dirty` / `set-watch` → por ventana vía `getWinFromEvent`.
- **Watcher** `fs.watch` por ventana → evento `file:changed` solo a su ventana. Ignora cambios disparados por el propio guardado (`lastSavedAt` por ventana).
- **Descargas**: IPC `file:save-blob` — el renderer envía el blob y el main muestra un único `dialog.showSaveDialog` y escribe el archivo.
- **Menú nativo** (Archivo/Editar/Vista/Ventana) con aceleradores Ctrl+O/N/S/Shift+S y `sendMenu` a `getFocusedWindow()`.

### 2. Preload (`src/preload/index.js`)

- `contextBridge.exposeInMainWorld('electronAPI', …)`: wrappers tipados de cada canal IPC.
- `getPathForFile(file)` usando `webUtils` para drag & drop.
- `windowsTtsSpeak/windowsTtsStop/windowsTtsVoices` para TTS Windows SAPI.

### 3. Renderer (Vue)

- **App.vue**: toolbar con Nuevo / Abrir / Guardar / Guardar como / Descargar Word / Restaurar ejemplo / modos Editor-Split-Vista; segunda barra `toolbar-tts` con `▶ Leer/⏸ Pausar/▶ Reanudar/⏹ Detener`, selector de voz, slider velocidad 0.5-2x, selector motor `web/windows`, estado, atajo `Ctrl+Shift+L` y lectura de selección o doc completo; `let savedContent` + `watch(markdown)` + `emit('dirty')` inmediato; título con `●`; suscriptor a `file:changed` y `file:open-requested`.
- **MarkdownInput.vue**: "Abrir archivo" vía IPC; drop con `getPathForFile`; debounce 300 ms + `emit('dirty')` inmediato para habilitar Guardar.
- **MarkdownViewer.vue + lib/**: copiados del proyecto base sin cambios funcionales.
- **lib/tts.js**: `stripMarkdown`, `chunkText(2500)`, `getVoices/getSpanishVoices`, `speak/pause/resume/stop` con cola de `SpeechSynthesisUtterance` y `setStateListener`; solo Web Speech (SAPI5) sin archivos temporales.

## Empaquetado (`electron-builder.yml`)

- `appId` + `productName: "Markdown Mermaid"`.
- `win.target: nsis`; `nsis.perMachine: true` y `oneClick: false` (instalador asistido: requisito para registrar `fileAssociations` de forma fiable en Windows).
- `fileAssociations`: `ext: [md, markdown, mdx]`, `name: Markdown`, `role: Editor`.
- Icono placeholder generado por `scripts/generate-icon.js` → `build/icon.png` / `build/icon.ico`.

## Scripts finales

```json
{
  "main": "./out/main/index.js",
  "scripts": {
    "dev":       "electron-vite dev",
    "build":     "electron-vite build",
    "build:win": "electron-vite build && electron-builder --win",
    "icon":      "node scripts/generate-icon.js"
  }
}
```

Se elimina `vite.config.js` (la configuración del renderer vive en `electron.vite.config.js`).

## Orden de implementación

1. Actualizar `package.json` (deps + main + scripts) e instalar.
2. Crear `electron.vite.config.js` y mover el renderer a `src/renderer/`.
3. Crear `src/main/index.js` y `src/preload/index.js` (multi-ventana).
4. Adaptar `App.vue` y `MarkdownInput.vue` + `lib/tts.js`; copiar `lib/`, `MarkdownViewer.vue`, `style.css` y `examples.js` del proyecto base.
5. `electron-builder.yml` + script de icono.
6. Verificación: `npm run dev` (multi-ventana, guardado con `savedContent`, TTS), `npm run build:win` → instalar y probar doble clic sobre varios `.md` y barra Lectura.

## Riesgos y notas

- Las asociaciones de archivo solo se registran en la **instalación** (electron-builder), no en dev; en dev se prueba con `npm run dev -- archivo.md`.
- Mermaid, docx y TTS requieren APIs de navegador (DOM/canvas/Image/speechSynthesis); por eso quedan en el renderer y el main solo hace I/O y SAPI PowerShell.
- `mermaid` y `docx` hacen el bundle grande (~3.7 MB); opcional a futuro: lazy-load de mermaid.
- TTS requiere voces SAPI instaladas en Windows; sin ellas `getVoices()` devuelve vacío.

## Notas de implementación (resueltas)

- **Vite**: se usa `vite ^7` (electron-vite 5 aún no soporta Vite 8).
- **Preload ESM**: con `"type": "module"` electron-vite emite el preload como `index.mjs`; el proceso principal lo referencia como `../preload/index.mjs` (con `sandbox: false`).
- **`console-message`**: en Electron 43 se usa la firma nueva `event` (`{ message, level, lineNumber, sourceId }`).
- **Dependencias del renderer en `devDependencies`**: se bundlean con vite en `out/renderer`, no entran en el asar como `node_modules`.
- **Diagnóstico de mermaid**: `mermaidRenderer.js` registra en consola el número de diagramas renderizados y el error concreto si un diagrama falla.
- **Multi-ventana**: `Set/WeakMap` por ventana, `getWinFromEvent(event.sender)` para IPC por ventana, `ttsProcess` por ventana.
- **Guardado**: `savedContent` + `watch` + `emit('dirty')` inmediato (evita botón deshabilitado).
- **TTS**: `import * as cp from 'node:child_process'` + `cp.spawn` PowerShell, `escapePsText` para `'`, `sapiRate = ((rate-1)*10)`, corrección de `})` extra en `registerIpc`.

## Estado final verificado

- `npm run dev` arranca la app con HMR, multi-ventana, guardado habilitado al primer keystroke y TTS `▶ Leer` funcional.
- `npm run build` compila main (13.20kB) + preload (2.07kB) + renderer sin errores.
- Ejecutable empaquetado (`dist\Markdown Mermaid.exe`) abre cada `.md` en ventana nueva y renderiza Mermaid.
- Instalador NSIS generado en `dist\Markdown Mermaid Setup 0.2.0.exe` (≈101 MB, perMachine, asociación `.md/.markdown/.mdx`) y TTS con voces SAPI.

## Correcciones posteriores (0.1.x → 0.2.0)

- **Descargas sin doble diálogo**: IPC `file:save-blob` (un único diálogo).
- **Editor con wrap**: `white-space: pre-wrap` + `overflow-wrap: break-word`.
- **Modo Vista a ancho completo**: `.mode-preview .markdown-body { max-width: none }`.
- **Arranque**: modo Vista por defecto (`mode: 'preview'`) y ventana 915×550.
- **Word sin líneas duplicadas**: avance de índice por profundidad en `buildDocxChildren`.
- **Guardado habilitado**: `savedContent` + `watch` + `dirty` inmediato.
- **Multi-ventana**: cada `.md` en ventana distinta (antes instancia única).
- **TTS Windows**: Web Speech + SAPI PowerShell, barra Lectura, selector voz/velocidad/motor, `Ctrl+Shift+L`.

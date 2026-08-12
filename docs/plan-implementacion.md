# Plan de implementación: Markdown Mermaid (Electron)

> Aplicación de escritorio para Windows construida con Electron + Vue 3 + Vite.
> Reutiliza la lógica de visualización/edición/exportación de `vue-mermaid-viewer-js`.

## Objetivo

Convertir el proyecto `vue-mermaid-viewer-electron` (Vue 3 + Vite vacío) en una app Electron de escritorio para Windows que:

- Abre `.md` / `.markdown` / `.mdx` por **doble clic en el explorador** (asociación de archivos), menú Abrir o drag & drop.
- Muestra **split editor + vista renderizada** con diagramas Mermaid (lógica reutilizada de `vue-mermaid-viewer-js`).
- Edita y **guarda** (Ctrl+S / Guardar como / botón).
- **Exporta a Word** (misma lógica `markdownToDocx`).

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
│   ├── main/index.js                # proceso principal (ventana, IPC, fs, watcher, descargas)
│   ├── preload/index.js             # contextBridge + webUtils.getPathForFile
│   └── renderer/                    # app Vue (movida desde src/ actual)
│       ├── index.html
│       └── src/
│           ├── main.js / style.css
│           ├── App.vue              # toolbar + save/new/open + estado dirty
│           ├── components/
│           │   ├── MarkdownInput.vue   # diálogo nativo + drop con ruta real
│           │   └── MarkdownViewer.vue  # igual que el proyecto base
│           └── lib/
│               ├── markdown.js
│               ├── mermaidRenderer.js
│               ├── diagramDownload.js
│               ├── markdownToDocx.js
│               └── examples.js
```

## Componentes clave

### 1. Proceso principal (`src/main/index.js`)

- `BrowserWindow` seguro: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, preload. Carga `ELECTRON_RENDERER_URL` en dev y `out/renderer/index.html` en producción. CSP en el index.html.
- **Instancia única**: `app.requestSingleInstanceLock()`; el evento `second-instance` captura `argv` y reenvía la ruta `.md` a la ventana abierta (comportamiento: reemplazar el archivo actual, pidiendo confirmación si hay cambios sin guardar).
- **Parseo de argv**: al arrancar, busca el primer argumento con extensión `.md|markdown|mdx`.
- **IPC** (`ipcMain.handle` / `ipcMain.on`):
  - `dialog:open-file` → diálogo nativo + lectura.
  - `file:open(path)` → `fs.readFile`, devuelve `{ path, content, name }`.
  - `file:save(path, content)` → `fs.writeFile`.
  - `file:save-as(content, suggested)` → `dialog.showSaveDialog` + escritura.
  - `file:save-blob(filename, data)` → `dialog.showSaveDialog` + escritura del blob (Word/SVG/PNG).
  - `app:get-initial-file` → ruta desde argv.
  - `set-title` → actualiza título de ventana.
  - `set-dirty` → marca la ventana como modificada para confirmar el cierre (`win.on('close')` + `dialog.showMessageBox`).
- **Watcher** `fs.watch` sobre el archivo abierto → evento `file:changed` al renderer. Ignora cambios disparados por el propio guardado (flag + comparación de mtime) para evitar bucles.
- **Descargas**: IPC `file:save-blob` — el renderer envía el blob (`downloadBlob` → `electronAPI.saveFileWithDialog`) y el main muestra un único `dialog.showSaveDialog` y escribe el archivo. Cubre exportación Word, SVG y PNG (un solo diálogo por descarga).
- **Menú nativo** (Archivo/Editar/Vista/Ventana/Ayuda) con aceleradores Ctrl+O/N/S/Shift+S y los clásicos de Edición (imprescindibles en Windows para el textarea). Menú contextual en el editor.

### 2. Preload (`src/preload/index.js`)

- `contextBridge.exposeInMainWorld('electronAPI', …)`: wrappers tipados de cada canal IPC.
- `getPathForFile(file)` usando `webUtils` (obligatorio en preload con context isolation; sustituye al deprecado `File.path` para drag & drop).

### 3. Renderer (Vue)

- **App.vue**: toolbar con Nuevo / Abrir / Guardar / Guardar como / Descargar Word / Restaurar ejemplo / modos Editor-Split-Vista; título con nombre de archivo y marcador de sin-guardar (`●`); atajos Ctrl+N/O/S/Shift+S; al montar llama `getInitialFile()`; suscriptor a `file:changed` (banner "recargar/ignorar", o aviso si hay cambios sin guardar).
- **MarkdownInput.vue**: "Abrir archivo" usa el diálogo nativo vía IPC; el drop obtiene la ruta con `getPathForFile` y valida extensión; se mantiene el debounce de 300 ms.
- **MarkdownViewer.vue + lib/**: copiados del proyecto base sin cambios funcionales.

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
3. Crear `src/main/index.js` y `src/preload/index.js`.
4. Adaptar `App.vue` y `MarkdownInput.vue`; copiar `lib/`, `MarkdownViewer.vue`, `style.css` y `examples.js` del proyecto base.
5. `electron-builder.yml` + script de icono.
6. Verificación: `npm run dev`, prueba de apertura/guardado/Word/Mermaid y `npm run build:win` → instalar y probar doble clic sobre un `.md`.

## Riesgos y notas

- Las asociaciones de archivo solo se registran en la **instalación** (electron-builder), no en dev; en dev se prueba con `npm run dev -- archivo.md`.
- Mermaid y la exportación a Word requieren APIs de navegador (DOM/canvas/Image); por eso todo queda en el renderer y el main solo hace I/O de ficheros.
- `mermaid` y `docx` hacen el bundle grande; opcional a futuro: lazy-load de mermaid.

## Notas de implementación (resueltas)

- **Vite**: se usa `vite ^7` (electron-vite 5 aún no soporta Vite 8; el template original traía `vite ^8`).
- **Preload ESM**: con `"type": "module"` electron-vite emite el preload como `index.mjs`; el proceso principal lo referencia como `../preload/index.mjs` (con `sandbox: false`).
- **`console-message`**: en Electron 43 se usa la firma nueva `event` (`{ message, level, lineNumber, sourceId }`); la firma antigua emite un deprecation warning.
- **Dependencias del renderer en `devDependencies`**: se bundlean con vite en `out/renderer`, por lo que no entran en el asar como `node_modules` (instalador más ligero).
- **Diagnóstico de mermaid**: `mermaidRenderer.js` registra en consola el número de diagramas renderizados y el error concreto si un diagrama falla (`[mermaid] …`).

## Estado final verificado

- `npm run dev` arranca la app con HMR.
- `npm run build` compila main + preload + renderer sin errores.
- Ejecutable empaquetado (`dist\Markdown Mermaid.exe`) abre el archivo `.md` recibido como argumento y renderiza los diagramas Mermaid (5 del ejemplo + los del archivo abierto), sin errores de preload ni de consola.
- Instalador NSIS generado en `dist\Markdown Mermaid Setup 0.1.0.exe` (perMachine, asociación de `.md`/`.markdown`/`.mdx`).

## Correcciones posteriores (0.1.x)

- **Descargas sin doble diálogo**: se sustituyó la interceptación `will-download` por el IPC `file:save-blob` (el main muestra un único diálogo y escribe el archivo). Elimina el doble diálogo de Word/SVG/PNG.
- **Editor con wrap**: `white-space: pre-wrap` + `overflow-wrap: break-word` en el textarea.
- **Modo Vista a ancho completo**: `.mode-preview .markdown-body { max-width: none }` (antes tope de 880 px).
- **Arranque**: la app abre en **modo Vista** por defecto (`mode: 'preview'`) y la ventana por defecto es **915×550**.
- **Word sin líneas duplicadas**: `buildDocxChildren` avanza el índice hasta el token de cierre en encabezados/párrafos/citas (evita el re-emitido del token `inline`) y localiza el cierre de listas anidadas por profundidad (viñetas correctas).


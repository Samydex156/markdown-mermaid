# Arquitectura

## Visión general

Aplicación de **escritorio para Windows** construida con Electron, con tres procesos clásicos:

```
┌───────────────────────────  Proceso principal (Node)  ───────────────────────────┐
│  src/main/index.js                                                                │
│  Ventana · instancia única · IPC · fs (leer/guardar) · watcher · descargas · menú │
└───────────────▲───────────────────────────────┬───────────────────────────────────┘
                │ ipcMain (handle/on)           │ webContents.send (eventos)
┌───────────────┴────────────┐   ┌───────────────▼───────────────────────────────────┐
│  src/preload/index.mjs     │   │              Renderer (Chromium + Vue)             │
│  contextBridge · webUtils  │──▶│  src/renderer/ → App.vue · MarkdownInput.vue      │
│  expone window.electronAPI │   │  MarkdownViewer.vue · lib/ (markdown, mermaid,    │
└────────────────────────────┘   │  diagramDownload, markdownToDocx, examples)        │
                                 └────────────────────────────────────────────────────┘
```

Todo el procesamiento pesado (Markdown → HTML, Mermaid → SVG, Markdown → docx) ocurre en el **renderer**; el proceso principal solo hace **I/O de ficheros**, diálogos y gestión de la ventana.

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
    ├── main/index.js            # Proceso principal
    ├── preload/index.js         # contextBridge + webUtils.getPathForFile
    └── renderer/                # App Vue (Electron renderer)
        ├── index.html           # CSP + punto de montaje
        ├── public/
        └── src/
            ├── main.js          # Punto de entrada Vue
            ├── App.vue          # Toolbar, layout split, estado del documento
            ├── style.css        # Variables de tema, markdown-body, diagramas
            ├── components/
            │   ├── MarkdownViewer.vue   # v-html + render de diagramas
            │   └── MarkdownInput.vue    # Editor con debounce + drag & drop por ruta
            └── lib/
                ├── markdown.js          # markdown-it + DOMPurify + fence mermaid
                ├── mermaidRenderer.js   # Render asíncrono de diagramas + toolbar SVG/PNG
                ├── diagramDownload.js   # Exportación SVG/PNG + rasterizado a Blob
                ├── markdownToDocx.js    # Conversión a documento Word (.docx)
                └── examples.js          # Documento de ejemplo precargado
```

## Flujos de datos

### Apertura de un archivo

1. **Doble clic en el explorador**: Windows lanza la app con la ruta como argumento.
   - Si la app no está abierta: `app:get-initial-file` devuelve la ruta extraída de `process.argv` (`filePathFromArgv`) y el renderer la abre.
   - Si ya está abierta: el evento `second-instance` envía `file:open-requested` con la ruta a la ventana activa.
2. **Menú Abrir / Ctrl+O**: `dialog:open-file` muestra el diálogo nativo y lee el fichero.
3. **Drag & drop**: `MarkdownInput.vue` obtiene la ruta real con `electronAPI.getPathForFile(file)` (vía `webUtils`) y llama a `file:open`.
4. En todos los casos se valida la extensión (`md|markdown|mdx`) y el renderer hace `loadFile(file)` → actualiza `markdown`, `currentPath`, `fileName`, limpia `dirty`, avisa al main (`set-watch`, `set-dirty`).
5. El **watcher** de `src/main/index.js` observa el directorio del archivo y emite `file:changed` si cambia fuera de la app (con recarga opcional y aviso si hay cambios sin guardar).

### Guardado

- **Ctrl+S / menú Guardar / botón**: si hay `currentPath` → `file:save` escribe el contenido; si no → `file:save-as` con diálogo nativo.
- El renderer notifica el resultado con `app:save-result`; si el guardado vino de un cierre solicitado por el main (diálogo "Guardar" al cerrar ventana con cambios), el main completa el cierre.
- `lastSavedAt` en el main suprime los eventos del watcher disparados por el propio guardado (evita bucles).

### Render del documento (renderer, heredado del proyecto base)

1. `MarkdownViewer.vue` calcula `html = renderMarkdown(source)`.
2. `markdown.js`: `markdown-it` (html, linkify, highlight.js) con fence custom para bloques `mermaid`; el HTML se sanea con `DOMPurify.sanitize` antes del `v-html`.
3. En `onMounted` y en cada cambio de `source` (`watch` + `flush: 'post'`) se llama a `renderDiagrams(container)`:
   - Agrupa `pre.mermaid` por fuente (deduplicación) y llama a `mermaid.render` por fuente única.
   - Reemplaza cada bloque por su SVG y añade el toolbar de descarga (SVG/PNG).
   - Si falla, muestra `.mermaid-error` sin romper el resto. Un token de render descarta resultados obsoletos.

### Descargas (Word, SVG, PNG)

- Los módulos de renderer disparan descargas con `downloadBlob` (un `<a download>` con `blob:`).
- Electron las captura con `session.on('will-download')` → `dialog.showSaveDialog` + `item.setSavePath`. Si el usuario cancela, `item.cancel()`.

### Cierre con cambios sin guardar

1. El renderer sincroniza el estado con `app:set-dirty(bool)` y el título con `app:set-title`.
2. En `win.on('close')`, si hay `dirty`, el main muestra un diálogo nativo: **Guardar / Descartar / Cancelar**.
3. "Guardar" → envía `menu:save` y espera `app:save-result` para cerrar; "Descartar" → cierra; "Cancelar" → no hace nada.

## Decisiones técnicas clave

| Decisión                              | Motivo                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| Electron + electron-vite              | Un solo bundler para main/preload/renderer con HMR en dev.          |
| Lógica de render en el renderer       | Mermaid y docx requieren DOM/canvas/Image; el main solo hace I/O.   |
| `contextIsolation` + preload          | Aislamiento del renderer; IPC acotado por `contextBridge`.          |
| `webUtils.getPathForFile` en preload  | Reemplaza al deprecado `File.path` para drag & drop con rutas reales.|
| `sandbox: false`                      | Requerido para preload ESM (`index.mjs`) con `type: module`.        |
| CSP en `index.html`                   | `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src` con `data:/blob:`; bloquea eval y fuentes externas. |
| Instancia única + `second-instance`   | Doble clic en `.md` reutiliza la ventana abierta (reemplaza archivo).|
| `file:save` + `lastSavedAt`           | Suprime eventos del watcher provocados por el propio guardado.      |
| `will-download` → `showSaveDialog`    | Guarda Word/SVG/PNG en la ruta elegida sin tocar `diagramDownload.js`.|
| NSIS `perMachine: true`               | Permite que electron-builder registre `fileAssociations` de forma fiable en Windows. |
| Renderer deps en `devDependencies`    | Se bundlean en `out/renderer`; el asar queda sin `node_modules` (instalador ligero). |

## Seguridad

- **Renderer aislado**: `contextIsolation: true`, `nodeIntegration: false`; solo se expone `window.electronAPI` (preload).
- **CSP**: sin `unsafe-eval`, sin fuentes externas; estilos inline permitidos (necesario para Mermaid).
- **XSS en el documento**: el HTML generado por markdown-it pasa por `DOMPurify.sanitize` antes del `v-html`.
- **XSS en diagramas**: `securityLevel: 'strict'` en Mermaid.
- **Navegación**: `setWindowOpenHandler` deniega ventanas nuevas; los enlaces externos quedan bloqueados por defecto.
- **Carga de archivos**: solo extensiones `md`, `markdown`, `mdx`.

## Notas

- Módulos **ESM** (`"type": "module"`) en main y preload. Electron requiere extensión `.mjs` en el preload ESM (el main lo referencia como `../preload/index.mjs`).
- `electron-vite` emite `out/main/index.js`, `out/preload/index.mjs` y `out/renderer/`.
- `electron-builder` empaqueta solo `out/**` (ver `files` en `electron-builder.yml`).

## Posibles evoluciones

- Lazy-loading de mermaid (import dinámico) para reducir el bundle inicial.
- Pestañas para varios documentos abiertos.
- Resaltado de sintaxis en el editor.
- Persistencia del documento en `localStorage` / archivos recientes.
- Exportación del documento completo a HTML/PDF.
- Registro de la asociación de archivos también en desarrollo (para pruebas sin instalar).

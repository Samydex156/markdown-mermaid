# Prompt: desarrolla esta aplicación

> Prompt para dar a un asistente de IA, escrito en primera persona como si el usuario pidiera desarrollar la app desde cero.

---

Necesito que desarrolles una **aplicación de escritorio para Windows** llamada **Markdown Mermaid** (paquete `markdown-mermaid`): un editor/visor de documentos Markdown con soporte nativo para diagramas **Mermaid**, que se integra con el explorador (doble clic en un `.md`) y exporta a Word. La lógica de render de Markdown/Mermaid y de exportación a Word debe reutilizarse de un proyecto base existente (`vue-mermaid-viewer-js`, Vue 3 + Vite).

## Stack

- **Electron** (última versión estable, ESM con `"type": "module"`).
- **electron-vite** como bundler de main/preload/renderer y **electron-builder** para el empaquetado.
- **Vue 3** (Composition API, `<script setup>`) en **JavaScript**.
- Dependencias del renderer (bundleadas con Vite): `markdown-it`, `mermaid` (v11), `highlight.js`, `dompurify`, `docx`, `vue`.
- Todo el texto de la interfaz en **español**.

## Funcionalidad

1. **Apertura de archivos**:
   - **Doble clic en el explorador**: asociación de `.md`/`.markdown`/`.mdx` registrada por el instalador NSIS (`fileAssociations`, `role: Editor`); la ruta llega en `process.argv`.
   - **Instancia única**: `app.requestSingleInstanceLock()`; si la app ya está abierta, `second-instance` reenvía la ruta a la ventana y **reemplaza** el documento actual (confirmando si hay cambios sin guardar).
   - **Menú Abrir / Ctrl+O**: diálogo nativo (`dialog.showOpenDialog`).
   - **Drag & drop** sobre el editor: obtener la ruta real con `webUtils.getPathForFile` (desde el preload) y leerla vía IPC.
2. **Editor + vista previa**: layout en dos paneles (split) con toggle **Editor / Split / Vista**. El editor usa **debounce de 300 ms** y la vista previa se actualiza sola.
3. **Render de Markdown y Mermaid**: reutilizar la lógica del proyecto base (`markdown-it` + DOMPurify + fence `mermaid`, render de diagramas con deduplicación por fuente, descarte de renders obsoletos y toolbar de descarga SVG/PNG).
4. **Guardado**: **Ctrl+S** guarda en el mismo archivo; **Ctrl+Shift+S** (o botón) muestra `dialog.showSaveDialog`. Indicador de **cambios sin guardar** (`●`) en el título; al cerrar la ventana con cambios, diálogo nativo **Guardar / Descartar / Cancelar**.
5. **Cambios externos**: `fs.watch` del archivo abierto → aviso al renderer con recarga opcional; ignorar los cambios causados por el propio guardado.
6. **Descargas**: los `blob:` del renderer (Word, SVG, PNG) se capturan con `will-download` → `dialog.showSaveDialog` + `item.setSavePath`.
7. **Menú nativo**: Archivo (Nuevo/Abrir/Guardar/Guardar como/Salir), Editar (undo/redo/cut/copy/paste/selectAll), Vista, Ventana.
8. **Seguridad**: `contextIsolation: true`, `nodeIntegration: false`, preload con `contextBridge`, CSP en el HTML del renderer, DOMPurify y Mermaid `securityLevel: 'strict'`.
9. **Icono** placeholder generado por script (sharp + png-to-ico) → `build/icon.ico`/`build/icon.png`.

## Estructura de archivos que quiero

```
src/
├── main/index.js                # Proceso principal (ventana, IPC, fs, watcher, descargas, menú)
├── preload/index.js             # contextBridge + webUtils.getPathForFile (window.electronAPI)
└── renderer/
    ├── index.html               # CSP
    └── src/
        ├── main.js
        ├── App.vue              # Toolbar, layout, estado del documento (path, dirty, título)
        ├── style.css
        ├── components/
        │   ├── MarkdownViewer.vue   # Vista previa (v-html + render de diagramas)
        │   └── MarkdownInput.vue    # Editor con debounce + drag & drop
        └── lib/
            ├── markdown.js
            ├── mermaidRenderer.js
            ├── diagramDownload.js
            ├── markdownToDocx.js
            └── examples.js
```

Configuración: `electron.vite.config.js`, `electron-builder.yml` (NSIS `oneClick: false`, `perMachine: true`, `fileAssociations`), `package.json` con `"main": "./out/main/index.js"` y scripts `dev` / `build` / `start` / `build:win` / `icon`.

## Criterios de aceptación

- `npm run dev` abre la app con HMR y sin errores de consola (incluido el preload).
- `npm run build` termina en verde (main + preload + renderer).
- `npm run build:win` genera el instalador NSIS en `dist/` con las asociaciones de `.md`/`.markdown`/`.mdx`.
- Al abrir la app se renderizan los 5 diagramas del ejemplo sin errores.
- Abrir un `.md` por argumento (doble clic) carga el archivo en el editor y la vista previa.
- Editar, guardar (Ctrl+S) y "Guardar como" funcionan sobre archivos reales.
- Cerrar la ventana con cambios sin guardar muestra el diálogo de confirmación.
- **Descargar Word** produce un `.docx` válido con títulos, tabla y diagramas como imágenes.
- Un diagrama con sintaxis inválida muestra el error inline sin romper la app.

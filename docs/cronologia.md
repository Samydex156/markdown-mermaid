# Cronología de desarrollo

Historial de las etapas de desarrollo del proyecto, en orden cronológico.

## 1. Inicio del proyecto (scaffold)

- Se partió de un scaffold **Vue 3 + Vite** generado con la plantilla oficial (`@vitejs/plugin-vue` + `vite`), sin Electron ni TypeScript.
- Estructura inicial: `src/main.js`, `src/App.vue`, `src/components/HelloWorld.vue`, `src/style.css` (CSS del template de bienvenida de Vite), `src/assets/` y `public/`.
- `build` definido como `vite build`.

## 2. Análisis del proyecto base

- Se analizó a fondo **`vue-mermaid-viewer-js`** (Vue 3 + Vite en JavaScript), que implementa el visor/editor de Markdown con Mermaid, descarga de diagramas SVG/PNG y exportación a Word.
- Se documentaron los detalles clave a reutilizar:
  - `markdown.js`: fence custom de mermaid + saneado con DOMPurify.
  - `mermaidRenderer.js`: render con `mermaid.render`, deduplicación por fuente, descarte de renders obsoletos (render token) y toolbar SVG/PNG.
  - `diagramDownload.js`: rasterizado PNG por **data URI** (evita *tainted canvas* en Chrome).
  - `markdownToDocx.js`: conversión del markdown a nodos `docx` usando los **tokens de markdown-it**, con diagramas incrustados como PNG.
  - `MarkdownInput.vue` (debounce 300 ms), `MarkdownViewer.vue`, `examples.js` y `style.css`.
- **Decisión**: la app de escritorio reutiliza íntegramente esa lógica; el trabajo nuevo es la capa Electron (proceso principal, preload y adaptación del renderer).

## 3. Planificación

- Se decidió el stack de escritorio: **Electron + electron-vite + electron-builder** (verificado contra npm en 2026: Electron 43, electron-vite 5, electron-builder 26).
- Decisiones de producto consultadas al usuario:
  - Nombre de producto: **Markdown Mermaid**.
  - Comportamiento multiarchivo: **instancia única, reemplazar el archivo actual** (con confirmación si hay cambios sin guardar).
  - Icono: **placeholder generado por script** (reemplazable).
- Se escribió el plan en `docs/plan-implementacion.md`.

## 4. Instalación de dependencias

- Runtime de escritorio: `electron`, `electron-vite`, `electron-builder`.
- Renderer (en `devDependencies`, se bundlean con Vite): `markdown-it`, `mermaid@^11`, `highlight.js`, `dompurify`, `docx`, `vue`.
- Icono: `sharp` + `png-to-ico`.
- Incidencias resueltas:
  - **electron-vite 5 no soporta Vite 8** (peer `^5 || ^6 || ^7`); se bajó `vite` a `^7`.
  - **npm bloquea scripts postinstall** (electron, esbuild, sharp, electron-winstaller); se aprobaron con `npm install-scripts approve` y se regeneró el binario de Electron (`node node_modules/electron/install.js`).

## 5. Restructuración a electron-vite

- Se creó `electron.vite.config.js` (entradas de main, preload y renderer).
- Se movió la app Vue a `src/renderer/` (`index.html`, `src/`, `public/`) y se eliminó el template de bienvenida (`HelloWorld.vue`, `vite.svg`, `vue.svg`, `hero.png`, `vite.config.js`).
- Se añadió **CSP** al `index.html` del renderer.

## 6. Proceso principal (`src/main/index.js`)

- `BrowserWindow` seguro: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`, preload.
- Instancia única (`app.requestSingleInstanceLock`) + evento `second-instance` para reenviar la ruta `.md` a la ventana abierta.
- Parseo de `argv` para abrir un archivo al arrancar (doble clic).
- IPC: `dialog:open-file`, `file:open`, `file:save`, `file:save-as`, `app:get-initial-file`, `app:set-title`, `app:set-dirty`, `app:set-watch`, `app:save-result`, `app:close-window`, `dialog:confirm`.
- **Watcher** `fs.watch` del archivo abierto → evento `file:changed` (ignora los cambios del propio guardado).
- Interceptación de descargas `will-download` → `dialog.showSaveDialog` (cubre Word, SVG y PNG).
- Menú nativo (Archivo/Editar/Vista/Ventana) con aceleradores y confirmación de cierre con cambios sin guardar.

## 7. Preload (`src/preload/index.js`)

- `contextBridge.exposeInMainWorld('electronAPI', …)` con wrappers de cada canal IPC.
- `getPathForFile(file)` usando `webUtils` (obligatorio en preload con context isolation; sustituye al deprecado `File.path` para drag & drop).

## 8. Renderer adaptado

- `App.vue`: toolbar (Nuevo / Abrir / Guardar / Guardar como / Descargar Word / Restaurar ejemplo / Editor-Split-Vista), nombre de archivo con indicador `●` de sin-guardar, atajos Ctrl+N/O/S/Shift+S, apertura del archivo inicial por argv, suscriptor a `file:open-requested` y `file:changed`, título de ventana sincronizado.
- `MarkdownInput.vue`: la apertura usa el diálogo nativo vía IPC y el drag & drop obtiene la **ruta real** con `getPathForFile`; se conserva el debounce de 300 ms.
- Se copiaron del proyecto base `MarkdownViewer.vue`, `lib/` y `style.css` sin cambios funcionales.

## 9. Empaquetado

- `electron-builder.yml`: instalador **NSIS** (`oneClick: false`, `perMachine: true`, que permite registrar asociaciones de forma fiable), icono y `fileAssociations` para `md`, `markdown`, `mdx`.
- `scripts/generate-icon.js`: genera `build/icon.ico` y `build/icon.png` (cuadro redondeado con degradado morado y formas de diagrama) con `sharp` + `png-to-ico`.
- `package.json`: `"main": "./out/main/index.js"` y scripts `dev`, `build`, `start`, `build:win`, `icon`.

## 10. Verificación e incidencias

- `npm run build`: compila main + preload + renderer en verde (el bundle incluye los chunks lazy de mermaid).
- **Preload ESM**: con `"type": "module"` electron-vite emite el preload como `index.mjs`; el main lo referencia como `../preload/index.mjs` (requiere `sandbox: false`).
- **`console-message` deprecado**: en Electron 43 se usa la firma nueva del evento (objeto `WebContentsConsoleMessageEventParams`).
- **Mermaid**: tras reportar que no renderizaba, se verificaron las dependencias (completas y con las mismas versiones que el proyecto base) y se añadió diagnóstico `[mermaid] …`; el render quedó confirmado en dev y en el ejecutable empaquetado (5 diagramas del ejemplo + los del archivo abierto, sin errores).
- `npm run build:win`: genera `dist\Markdown Mermaid Setup 0.1.0.exe` y el ejecutable portable en `dist\win-unpacked\`.

## 11. Documentación

- `docs/`: contexto, cronología, arquitectura, README, prompt y plan de implementación, replicando el estilo de documentación del proyecto base.

## Línea de tiempo resumida

| Etapa            | Descripción                                           |
| ---------------- | ----------------------------------------------------- |
| 1. Scaffold      | Proyecto Vue 3 + Vite (sin Electron)                  |
| 2. Análisis      | Estudio de `vue-mermaid-viewer-js` para reutilizar    |
| 3. Planificación | Stack Electron + decisiones de producto + `docs/plan`  |
| 4. Dependencias  | electron, electron-vite, electron-builder, sharp, etc.|
| 5. Restructuración | Renderer a `src/renderer/` + config electron-vite    |
| 6. Main          | Ventana, IPC, watcher, descargas, menú, instancia única|
| 7. Preload       | contextBridge + webUtils                              |
| 8. Renderer      | App.vue, MarkdownInput adaptados + lib del base        |
| 9. Empaquetado   | NSIS + fileAssociations + icono                        |
| 10. Verificación | Build, preload .mjs, console-message, mermaid, NSIS    |
| 11. Documentación | docs/ completo                                        |

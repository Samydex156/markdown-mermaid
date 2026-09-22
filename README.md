# Markdown Mermaid

Editor y visualizador de documentos **Markdown** para **Windows** con soporte nativo para diagramas **Mermaid** y **lector TTS**, construido con **Electron + Vue 3**. Se abre con un doble clic sobre un archivo `.md`, `.markdown` o `.mdx`, edita el documento en un split editor/vista previa con render en tiempo real de diagramas Mermaid, guarda los cambios directamente sobre el archivo, exporta a **Word (.docx)** y permite **lectura en voz alta** del contenido con voces SAPI de Windows.

## Características

- Doble clic en un `.md` del explorador para abrir el archivo (asociación registrada por el instalador).
- **Multi-ventana**: cada archivo se abre en una ventana distinta (no reutiliza la misma); estado, watcher y TTS por ventana.
- Editor con debounce y vista previa en tiempo real; modos **Editor / Split / Vista**.
- Markdown completo (markdown-it) con resaltado de sintaxis (highlight.js) y HTML saneado (DOMPurify).
- Diagramas **Mermaid v11** renderizados a SVG, con descarga individual en **SVG** o **PNG** (2x).
- Exportación del documento completo a **Word (.docx)** con los diagramas como imágenes.
- Guardado directo (Ctrl+S), Guardar como (Ctrl+Shift+S), diálogos nativos, indicador de cambios sin guardar y confirmación al cerrar. Botón **Guardar** habilitado por tracking `savedContent` + evento `dirty` inmediato.
- **Lector TTS Windows**: Web Speech (SAPI5) + fallback PowerShell `System.Speech`; barra Lectura con `▶ Leer/⏸ Pausar/▶ Reanudar/⏹ Detener`, selector de voz (es-ES/MX), control de velocidad 0.5-2x, selector de motor `Web/Windows SAPI`, atajo `Ctrl+Shift+L` y lectura de selección. Solo streaming en memoria, sin archivos temporales.
- Detección de cambios externos en el archivo abierto.
- Proceso de render aislado, CSP, `securityLevel: 'strict'`.

## Requisitos

- Node.js ≥ 20.19 (desarrollado con Node 24)
- npm
- Windows x64 (target de empaquetado)
- Voces SAPI instaladas para TTS (p. ej. `Microsoft Sabina` en Windows 10/11)

## Puesta en marcha

```bash
npm install
npm run dev        # Desarrollo con HMR
npm run build:win  # Genera el instalador NSIS en dist/
```

> **Nota (Windows/npm)**: si npm bloquea los scripts postinstall de `electron`/`esbuild`/`sharp`, aprueba los permisos con `npm install-scripts approve electron esbuild sharp` y regenera el binario con `node node_modules/electron/install.js`.

## Scripts

| Comando        | Descripción                                                    |
| -------------- | -------------------------------------------------------------- |
| `npm run dev`  | Arranca Electron en desarrollo con HMR.                        |
| `npm run build`| Compila main + preload + renderer a `out/`.                    |
| `npm run start`| Previsualiza el build de producción.                           |
| `npm run build:win` | Compila y genera el instalador NSIS en `dist/`.           |
| `npm run icon` | Regenera `build/icon.ico` y `build/icon.png`.                  |

## Documentación

Guías y notas de desarrollo en [`docs/`](docs/readme.md):

- [Guía de usuario](docs/readme.md) — instalación, uso y flujo de trabajo.
- [Contexto del proyecto](docs/contexto.md) — qué es, por qué y características.
- [Plan de implementación](docs/plan-implementacion.md) — plan y notas de desarrollo.
- [Arquitectura](docs/arquitectura.md) — procesos, flujos de datos y seguridad.
- [Cronología](docs/cronologia.md) — cronología del desarrollo.
- [Prompt](docs/prompt.md) — prompt de desarrollo original.
- [Guía de Release](docs/guia-release.md) — del repositorio al instalador disponible en GitHub.

## Licencia

Privado / sin licencia especificada.

# Contexto del proyecto

## ¿Qué es?

**Markdown Mermaid** es una aplicación de **escritorio para Windows** construida con **Electron** que permite abrir, editar y visualizar documentos **Markdown** con soporte nativo para diagramas **Mermaid** y **lector TTS**. Al hacer **doble clic** sobre un archivo `.md`, `.markdown` o `.mdx` en el explorador, la aplicación se abre con el documento cargado en **modo Vista** (con toggle a **Split** y **Editor**), con guardado directo sobre el mismo archivo y lectura en voz alta.

Es la evolución de escritorio del proyecto web `vue-mermaid-viewer-js` (Vue 3 + Vite), del que reutiliza toda la lógica de render de Markdown/Mermaid y exportación a Word, ampliada con multi-ventana y TTS Windows.

## ¿Por qué existe?

Los documentos Markdown suelen incluir diagramas Mermaid (diagramas de flujo, secuencia, clases, Gantt, etc.). En Windows, los editores nativos o bien no los renderizan, o lo hacen en herramientas pesadas. Este proyecto busca:

- **Integración con el explorador**: abrir `.md` con doble clic como una aplicación de escritorio real (cada archivo en ventana nueva).
- **Edición y guardado fiable**: editar el documento y guardarlo en el mismo archivo (Ctrl+S) con tracking `savedContent` y habilitación inmediata del botón Guardar.
- **Renderizado local**: todo ocurre en el propio ordenador; el contenido no sale del equipo.
- **Salida útil**: descargar cada diagrama como **SVG** o **PNG** y el **documento completo como Word (.docx)**.
- **Accesibilidad**: escuchar el contenido con **TTS Windows** (voces SAPI) mientras se hace otra tarea, con control de voz/velocidad y lectura de selección.

## Características

- Apertura de archivos `.md` / `.markdown` / `.mdx` por **doble clic** en el explorador (asociación de archivos registrada por el instalador NSIS).
- **Multi-ventana**: cada archivo se abre en ventana distinta con estado, watcher y TTS aislados (`Set<BrowserWindow>` + `WeakMap` por ventana).
- Editor + vista previa en modo **Editor**, **Split** y **Vista previa** (abre en **Vista** por defecto), con actualización en tiempo real (debounce de 300 ms) y habilitación inmediata de Guardar vía evento `dirty`.
- Markdown con sintaxis extendida: tablas, listas, citas, links automáticos (markdown-it).
- Resaltado de sintaxis en bloques de código con **highlight.js**.
- Diagramas **Mermaid v11** renderizados a SVG (flowchart, sequence, class, gantt, pie y más).
- Descarga individual de cada diagrama como **SVG** o **PNG** (2x de resolución).
- Descarga del documento completo como **Word (.docx)** con los diagramas como imágenes.
- **Guardado** directo (Ctrl+S), **Guardar como** (Ctrl+Shift+S), **Abrir** (Ctrl+O) y **Nuevo** (Ctrl+N), también desde el menú nativo de la aplicación.
- **Lector TTS Windows**: Web Speech (SAPI5) + fallback PowerShell `System.Speech`; barra Lectura con `▶ Leer/⏸ Pausar/▶ Reanudar/⏹ Detener`, selector de voz (es-ES/MX), velocidad 0.5-2x, motor `Web/Windows SAPI`, atajo `Ctrl+Shift+L`, lectura de selección o documento completo. Solo streaming en memoria.
- Indicador de **cambios sin guardar** (`●`) y confirmación al cerrar la ventana con cambios pendientes (por ventana).
- Detección de cambios **externos** en el archivo abierto (watcher por ventana, con recarga opcional).
- Diálogos nativos de Windows (abrir/guardar).
- Seguridad: proceso de render aislado (`contextIsolation`), CSP, HTML saneado con **DOMPurify** y Mermaid en `securityLevel: 'strict'`.
- Tema claro/oscuro que sigue la preferencia del sistema.
- Documento de ejemplo precargado al abrir la app.

## Usuarios objetivo

Desarrolladores y personas técnicas que trabajan con documentación Markdown con diagramas en Windows, y que necesitan un editor ligero integrado en el explorador, con vista previa en tiempo real, exportación de los diagramas y del documento a Word, y lectura en voz alta para accesibilidad.

## Tecnologías

| Capa            | Tecnología                                    |
| --------------- | --------------------------------------------- |
| Runtime         | Electron 43                                   |
| Framework UI    | Vue 3.5 (Composition API, `<script setup>`)   |
| Lenguaje        | JavaScript (ESM)                              |
| Build           | electron-vite 5 + Vite 7                      |
| Empaquetado     | electron-builder 26 (instalador NSIS)         |
| Markdown        | markdown-it 15 + DOMPurify 3                  |
| Diagramas       | Mermaid 11                                    |
| Código          | highlight.js 11                               |
| Word            | docx 9 (generación .docx en el renderer)      |
| TTS Windows     | Web Speech API (SAPI5) + PowerShell System.Speech |

## Estado

Aplicación funcional en su versión 0.2.0 para Windows (x64). `npm run build` y `npm run build:win` terminan en verde; se generó el instalador NSIS `dist\Markdown Mermaid Setup 0.2.0.exe` (≈101 MB) con asociación de `.md`, `.markdown` y `.mdx` (cada archivo en ventana nueva), guardado con tracking `savedContent` y lector TTS con voces SAPI. La apertura por doble clic se activa al **instalar** la aplicación.

---
name: electron-vue-vite-deps
description: Use when scaffolding or configuring a new Electron + Vue 3 + Vite project (electron-vite + electron-builder) to pick the correct dependency versions and package.json/config setup so install and build succeed without errors. Helps on version mismatches, Vite 8 vs electron-vite, postinstall script blocks on Windows, preload ESM, and devDependencies vs dependencies placement.
---

# Configurar dependencias: Electron + Vue 3 + Vite

## Cuándo usar

Cuando se va a crear o reparar un proyecto Electron con renderer Vue 3, en particular para elegir versiones de dependencias compatibles y la estructura de `package.json`/configs de forma que `npm install`, `npm run dev`, `npm run build` y el empaquetado con electron-builder funcionen a la primera, sin errores de versión ni de preload.

## Tabla de versiones compatible (2026, verificada)

Instalar estas versiones evita los errores más comunes. No usar "latest" a ciegas.

| Paquete            | Versión  | Rol                                     | Dónde         |
| ------------------ | -------- | --------------------------------------- | ------------- |
| electron           | ^43      | Runtime de escritorio                    | devDependencies |
| electron-vite      | ^5       | Build main/preload/renderer + HMR        | devDependencies |
| electron-builder   | ^26      | Empaquetado, NSIS, fileAssociations      | devDependencies |
| vite               | ^7       | Bundler del renderer                     | devDependencies |
| @vitejs/plugin-vue | ^6       | Soporte SFC Vue para Vite                | devDependencies |
| vue                | ^3.5     | UI (renderer)                            | devDependencies |

Paquetes típicos del renderer (también en `devDependencies`, ver nota): `markdown-it` (^15), `mermaid` (^11), `highlight.js` (^11), `dompurify` (^3), `docx` (^9).

> **Node**: usar Node ≥ 20.19 (proyecto desarrollado con Node 24). Electron 43 requiere Node ≥ 22 para ejecutar su instalador.

## Reglas clave

### 1. Vite 7, NO Vite 8

`electron-vite@5` aún no soporta Vite 8. Si un template trae `vite: ^8`, **bajarlo a `^7`** antes de instalar. Síntoma: error de peer dependency o fallo en `electron-vite dev`.

### 2. Todo en `devDependencies` (no `dependencies`)

Los paquetes del renderer se bundlean con Vite a `out/renderer`; no hace falta que estén en `dependencies`. Esto mantiene el asar ligero y evita que `electron-builder` intente empaquetar `node_modules` del runtime. Resultado: `"dependencies": {}` vacío (o casi).

### 3. `package.json` mínimo correcto

```json
{
  "name": "mi-app",
  "version": "0.1.0",
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "build:win": "electron-vite build && electron-builder --win",
    "icon": "node scripts/generate-icon.js"
  }
}
```

- `"type": "module"` obliga a main y preload en ESM (ver preload abajo).
- `"main"` debe apuntar al main compilado (`out/main/index.js`), no a `src/main/index.js`.

### 4. Preload ESM: extensión `.mjs`

Con `"type": "module"`, electron-vite emite el preload como `out/preload/index.mjs`. El main debe referenciarlo así:

```js
preload: path.join(__dirname, '../preload/index.mjs')
```

Y en `BrowserWindow` usar `sandbox: false` (los preloads ESM requieren desactivar el sandbox).

### 5. Windows: scripts postinstall bloqueados

`electron`, `esbuild` y `sharp` instalan binarios con scripts postinstall que npm por defecto puede bloquear (npm 11+). Solución:

```bash
npm install-scripts approve electron esbuild sharp
```

Si el binario de Electron no se descargó:

```bash
node node_modules/electron/install.js
```

Verificar: `npx electron --version` devuelve la versión instalada.

### 6. Config de electron-vite

`electron.vite.config.js` en la raíz (NO `vite.config.js`; este último se elimina):

```js
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: { plugins: [vue()] }
})
```

La estructura de carpetas esperada: `src/main/index.js`, `src/preload/index.js`, `src/renderer/index.html` y `src/renderer/src/**`.

### 7. CSP en el renderer

En `src/renderer/index.html`, `<meta http-equiv="Content-Security-Policy">` con `script-src 'self'` y `style-src 'self' 'unsafe-inline'` (necesario para Mermaid). Sin `unsafe-eval`.

## Errores frecuentes y solución

| Síntoma                                        | Causa                                            | Solución                                        |
| ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| Error de peer dep en install                   | `vite ^8` con electron-vite 5                    | Bajar vite a `^7`                               |
| `npm run dev` no arranca / HMR roto            | Falta `electron.vite.config.js`                  | Crearlo con main/preload/renderer                |
| Preload no carga (`index.js` en vez de `.mjs`) | Referencia a `index.js` con ESM                  | Usar `out/preload/index.mjs`                     |
| "Cannot find module" en main                   | `"main"` apunta a `src/`, no a `out/`            | `"main": "./out/main/index.js"`                  |
| postinstall/scripts bloqueados en npm install  | Seguridad npm en Windows                         | `npm install-scripts approve ...` + `electron/install.js` |
| Electron no abre en dev                        | Binario no descargado                            | `node node_modules/electron/install.js`          |
| Bundle enorme en build                         | `dependencies` lleno con libs del renderer       | Mover a `devDependencies` (se bundlean igual)    |

## Verificación después de instalar

1. `npx electron --version` → muestra versión (binario OK).
2. `npm run dev` → abre la ventana sin errores de preload en consola.
3. `npm run build` → compila `out/main`, `out/preload`, `out/renderer` en verde.
4. (Opcional) `npm run build:win` → genera instalador NSIS en `dist/`.

## Notas del proyecto de referencia

Este skill proviene del proyecto `markdown-mermaid` (`vue-mermaid-viewer-electron`). Detalles de su implementación en `docs/plan-implementacion.md` (versiones) y `docs/arquitectura.md` (procesos, seguridad).

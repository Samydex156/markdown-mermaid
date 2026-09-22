---
name: run-installer
description: Use when the user wants to run the Markdown Mermaid Electron app in development or generate the Windows installer (.exe) from a clean clone. Covers clean-up, restore of dependencies (postinstall), dev, build and NSIS installer. Trigger words: "correr la app", "generar instalador", "build:win", "limpiar proyecto", "desde cero".
---

# Correr y generar el instalador — Markdown Mermaid (Electron + Vue 3)

> App de escritorio para Windows (Electron 43 + Vue 3 + Vite 7). Todo ocurre en local; el instalador NSIS registra la asociación `.md/.markdown/.mdx`.

## Cuándo usar

- Clon limpio (`git clone`) o después de **limpiar** `node_modules/out/dist`.
- Para **correr en dev** (`npm run dev`) o **generar el instalador** (`npm run build:win` → `dist/Markdown Mermaid Setup 0.2.0.exe`).

## Prerrequisitos

| Herramienta | Versión | Notas |
| ----------- | ------- | ----- |
| Node.js | ≥ 20.19 (dev con 24) | `node -v` |
| npm | 10+ | `npm -v` |
| Windows x64 | 10/11 | Necesario para `build:win` y TTS SAPI |
| Git | cualquiera | Solo si se clona |

## 1. Limpiar (opcional, deja el repo como recién clonado)

Carpetas que **se pueden borrar sin riesgo** (no versionadas, `.gitignore`):

```powershell
# desde la raíz del proyecto
Remove-Item -Recurse -Force node_modules, out, dist -ErrorAction SilentlyContinue
# opcional: limpiar cache npm si hubo cambios de versión
npm cache clean --force
```

**NO borrar:** `build/` (`build/icon.ico` + `build/icon.png` los necesita `electron-builder.yml` `win.icon`), `src/`, `docs/`, `scripts/`.

Estado tras limpiar:

```
vue-mermaid-viewer-electron/
├── build/icon.ico   ← se conserva
├── src/             ← código
├── package.json / package-lock.json
└── (sin node_modules/out/dist)
```

## 2. Restaurar dependencias (desde cero)

```powershell
npm install
```

En Windows npm 11+ puede **bloquear postinstall** de `electron/esbuild/sharp`. Si `npm install` avisa de scripts bloqueados o `npx electron --version` falla:

```powershell
npm install-scripts approve electron esbuild sharp
node node_modules/electron/install.js
npx electron --version   # debe mostrar e.g. v43.3.0
```

> `package.json` tiene todo en `devDependencies` (se bundlean a `out/renderer`); `"dependencies": {}` queda vacío a propósito — ver `docs/skill-electron-vue-vite-deps/SKILL.md`.

## 3. Correr en desarrollo (HMR)

```powershell
npm run dev
```

- Compila `out/main` + `out/preload` y levanta Vite en `http://localhost:5173`.
- Abre la ventana Electron (915×550, modo Vista). Logs: `[main] renderer cargado`.
- Probar doble clic en dev: `npm run dev -- ruta\archivo.md` (la asociación real solo existe tras instalar).
- Atajos: `Ctrl+O` Abrir, `Ctrl+S` Guardar, `Ctrl+Shift+S` Guardar como, `Ctrl+Shift+L` TTS Leer/Pausar.

Detener: cerrar ventana o `Ctrl+C` en la terminal.

## 4. Build de producción (sin instalador)

```powershell
npm run build        # electron-vite build → out/main, out/preload, out/renderer
npm run start        # previsualiza el build (carga file://)
```

Verifica `out/main/index.js` (~13kB), `out/preload/index.mjs` (~2kB) y `out/renderer/` (~3.7 MB por mermaid).

## 5. Generar el instalador Windows (NSIS)

```powershell
npm run build:win
```

Hace `electron-vite build && electron-builder --win`:

- Lee `electron-builder.yml` (`appId com.markdownmermaid.app`, `win.target nsis`, `nsis.perMachine true oneClick false`, `fileAssociations` md/markdown/mdx, `directories.output dist`).
- Produce:

```
dist/
├── Markdown Mermaid Setup 0.2.0.exe          ← instalador (≈101 MB)
├── Markdown Mermaid Setup 0.2.0.exe.blockmap
├── win-unpacked/                            ← app sin instalar (prueba)
└── latest.yml
```

Instalar: doble clic en `Setup 0.2.0.exe` → asistido por equipo → registra doble clic `.md`.

## 6. Flujo completo desde cero (copy-paste)

```powershell
git clone https://github.com/Samydex156/markdown-mermaid.git
cd markdown-mermaid
npm install
npm install-scripts approve electron esbuild sharp   # si npm avisa
node node_modules/electron/install.js               # si falta binario
npx electron --version
npm run dev        # probar
npm run build:win  # generar instalador
dir dist\*.exe
```

## 7. Publicar (opcional)

Ver `docs/guia-release.md` y `docs/skill-git-github-release/SKILL.md`:

```powershell
git add -A; git commit -m "feat: ..."; git push
gh release create v0.2.0 "dist\Markdown Mermaid Setup 0.2.0.exe" --title "Markdown Mermaid v0.2.0" --notes "..."
```

## Errores frecuentes

| Síntoma | Causa | Solución |
| ------- | ----- | -------- |
| `Electron uninstall` en `npm run dev` | Binario no descargado por postinstall bloqueado | `npm install-scripts approve electron esbuild sharp` + `node node_modules/electron/install.js` |
| `vite v8` peer dep con `electron-vite@5` | Vite incompatible | Usar `vite ^7` (ya fijado en `package.json`) |
| Preload no carga / `index.js` vs `.mjs` | Referencia antigua | `main` usa `../preload/index.mjs` y `sandbox: false` |
| `npm run build:win` no genera `dist` | Falta `build/icon.ico` | `npm run icon` o restaurar `build/` desde git |
| TTS sin voces | Sin SAPI instaladas | Instalar voces Windows (Configuración → Hora e idioma → Voz) |

## Notas

- `out/` y `dist/` están en `.gitignore` — no se versionan; el instalador se distribuye como **asset de Release**, no como código.
- Limpiar con `Remove-Item node_modules,out,dist` deja el repo listo para `npm install` sin perder iconos ni fuentes.
- Esta skill es el resumen operativo; detalles de arquitectura y cronología en `docs/arquitectura.md` y `docs/cronologia.md`.

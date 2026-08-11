# Guía: del repositorio al instalador disponible en GitHub

> Procedimiento completo para, partiendo de cero, tener la aplicación **Markdown Mermaid** versionada en GitHub y su instalador **.exe** disponible para descargar sin que el usuario tenga que clonar el repositorio ni instalar Node.js.

## Índice

1. [Prerrequisitos](#1-prerrequisitos)
2. [Crear el repositorio local y subirlo a GitHub](#2-crear-el-repositorio-local-y-subirlo-a-github)
3. [Clonar e instalar en otra máquina (desarrollo)](#3-clonar-e-instalar-en-otra-máquina-desarrollo)
4. [Generar el instalador](#4-generar-el-instalador)
5. [Publicar una Release en GitHub](#5-publicar-una-release-en-github)
6. [Instalar la app desde el Release (usuario final)](#6-instalar-la-app-desde-el-release-usuario-final)
7. [Publicar una nueva versión (flujo habitual)](#7-publicar-una-nueva-versión-flujo-habitual)
8. [Notas y resolución de problemas](#8-notas-y-resolución-de-problemas)

---

## 1. Prerrequisitos

| Herramienta | Versión mínima | Para qué |
| ----------- | -------------- | -------- |
| Git         | cualquiera     | Control de versiones |
| Node.js     | ≥ 20.19        | Instalar dependencias y compilar |
| npm         | 10+            | Gestor de paquetes |
| GitHub CLI (`gh`) | 2.x      | Crear repositorio y releases |

Iniciar sesión una vez en la máquina de desarrollo:

```bash
gh auth login
```

> El repositorio de este proyecto es `Samydex156/markdown-mermaid` (público). En los ejemplos se usa esa URL; ajustar si se crea otro repositorio.

---

## 2. Crear el repositorio local y subirlo a GitHub

### 2.1 Preparar el `.gitignore`

Ignorar lo que no debe versionarse. En este proyecto (Electron) se ignoran, al menos:

- `node_modules/` — dependencias instaladas
- `out/` — build de electron-vite (compilación)
- `dist/` y `release/` — instaladores/empaquetados de electron-builder
- `*.log`, `.vscode/*` (salvo `extensions.json`), `Thumbs.db`, `Desktop.ini`

**Importante:** `build/` (iconos) **sí** se versiona porque `electron-builder.yml` lo necesita (`win.icon: build/icon.ico`). El instalador `.exe` **no** se sube como parte del código: se publica como **asset de un Release** (paso 5).

### 2.2 Inicializar y primer commit

```bash
git init -b main
git add -A
git status          # comprobar que NO aparecen node_modules/ ni out/ ni dist/
git commit -m "chore: inicializar proyecto"
```

### 2.3 Crear el repositorio remoto y subir

```bash
gh repo create markdown-mermaid --public --source . --remote origin --description "Editor y visualizador de Markdown con diagramas Mermaid (Electron + Vue 3)"
git push -u origin main
```

---

## 3. Clonar e instalar en otra máquina (desarrollo)

```bash
git clone https://github.com/Samydex156/markdown-mermaid.git
cd markdown-mermaid
npm install
```

En Windows, si npm bloquea los scripts postinstall de `electron`/`esbuild`/`sharp`:

```bash
npm install-scripts approve electron esbuild sharp
node node_modules/electron/install.js   # si el binario de Electron no se descargó
```

Verificar:

```bash
npm run dev        # arranca la app con HMR
npm run build      # compila main + preload + renderer sin errores
```

---

## 4. Generar el instalador

```bash
npm run build:win
```

Hace dos cosas:

1. `electron-vite build` → compila el código a `out/`.
2. `electron-builder --win` → empaqueta y genera el instalador NSIS en `dist/`.

Resultado esperado en `dist/`:

```
Markdown Mermaid Setup 0.1.0.exe      ← instalador (≈97 MB)
Markdown Mermaid Setup 0.1.0.exe.blockmap
win-unpacked/                          ← app sin instalar (para pruebas)
latest.yml                             ← usado por el auto-updater (si se configura)
```

---

## 5. Publicar una Release en GitHub

Una **Release** asocia una **etiqueta (tag)** con el binario compilado y notas. El instalador se sube como **asset**, descargable desde la web sin clonar el repo.

### 5.1 Crear release con el instalador

```bash
gh release create v0.1.0 "dist\Markdown Mermaid Setup 0.1.0.exe" \
  --repo Samydex156/markdown-mermaid \
  --title "Markdown Mermaid v0.1.0" \
  --notes "## Primer release ..."
```

- `v0.1.0` es el **tag**. Debe coincidir con `version` en `package.json`.
- Los assets se pasan como rutas separadas tras el tag (se puede añadir más de uno, p. ej. el `.blockmap` para auto-update).
- Sin `--draft`, la release se publica directamente.

### 5.2 Si el proceso se interrumpe (draft incompleto)

Subir el `.exe` más de ~100 MB a GitHub tarda. Si `gh release create` se corta (timeout), queda una **release en borrador** sin asset:

```bash
# Subir el asset a la release existente
gh release upload v0.1.0 "dist\Markdown Mermaid Setup 0.1.0.exe" --repo Samydex156/markdown-mermaid

# Publicar (quitar el modo borrador)
gh release edit v0.1.0 --repo Samydex156/markdown-mermaid --draft=false
```

### 5.3 Verificar

```bash
gh release view v0.1.0 --repo Samydex156/markdown-mermaid --json isDraft,assets --jq '{isDraft, assets: [.assets[] | .name]}'
```

Debe devolver `"isDraft": false` y el nombre del `.exe`.

---

## 6. Instalar la app desde el Release (usuario final)

El usuario final **no necesita Git ni Node.js**:

1. Abre el repositorio en GitHub → pestaña **Releases** (o la URL directa `https://github.com/Samydex156/markdown-mermaid/releases/latest`).
2. Descarga `Markdown Mermaid Setup 0.1.0.exe`.
3. Lo ejecuta; el instalador NSIS (modo asistido, por equipo) guía la instalación y **registra la asociación** de `.md`, `.markdown` y `.mdx`.
4. Tras instalar, **doble clic sobre un documento Markdown** abre la aplicación con el archivo cargado.

> En equipos sin SmartScreen confiando aún en el binario, Windows puede mostrar "protegió su equipo". Se puede pulsar **Más información → Ejecutar de todas formas**, o firmar el ejecutable con un certificado de código (fuera del alcance de esta guía).

---

## 7. Publicar una nueva versión (flujo habitual)

Cuando hay cambios en el código:

```bash
# 1. Subir el código
git add -A
git commit -m "feat: ..."
git push

# 2. Actualizar la versión en package.json (p. ej. 0.2.0) e instalar deps
#    (npm version 0.2.0 crea además el tag automáticamente)

# 3. Generar el instalador
npm run build:win

# 4. Publicar la release con el nuevo instalador
gh release create v0.2.0 "dist\Markdown Mermaid Setup 0.2.0.exe" \
  --repo Samydex156/markdown-mermaid \
  --title "Markdown Mermaid v0.2.0" \
  --notes "Notas de la versión..."
```

---

## 8. Notas y resolución de problemas

**¿Por qué el `.exe` no está en el repositorio?**
`dist/` está en el `.gitignore`. El instalador se distribuye como **asset de la Release**, no como parte del código fuente. Ventajas: repo ligero, la release queda vinculada a una versión/tag, y GitHub genera la página de descarga.

**Timeout al subir el instalador**
El `.exe` pesa ~97 MB. Usar `gh release create` con un timeout amplio o, si se corta, `gh release upload` + `gh release edit --draft=false` (sección 5.2). Una subida interrumpida deja la release en borrador; nunca borrarla sin comprobar si el asset subió.

**npm bloquea scripts postinstall en Windows**
`npm install-scripts approve electron esbuild sharp` y, si hace falta, `node node_modules/electron/install.js`.

**El doble clic no abre la app tras instalar**
La asociación de archivos la registra el **instalador**; ejecutar la app desde `dist\win-unpacked\Markdown Mermaid.exe` sin instalar no la registra. Reinstalar con el instalador NSIS.

**SmartScreen bloquea la instalación**
Binario sin firmar. Opciones: "Más información → Ejecutar de todas formas", firmar con certificado de código, o configurar `nsis.publish`/firma en `electron-builder.yml`.

**Actualizar el README**
En el README principal y en `docs/readme.md` se referencia esta guía para que el flujo "repo → instalador → release" quede documentado junto al proyecto.

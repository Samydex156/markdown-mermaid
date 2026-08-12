---
name: git-github-release
description: Use when the user wants to take a project (Vue 3, Electron, Flutter Android/Windows, Go, HTML/vanilla, etc.) from an unversioned folder to GitHub: git init, .gitignore, commit, push, `gh repo create`, and optionally publish a Release with the build artifact. Trigger words: "subir el proyecto a GitHub", "crear el repositorio", "git init", "gh repo create", "publicar un release", "generar la release", "commit y push".
---

# Subir un proyecto a GitHub y publicar un Release

> Flujo completo y genérico para versionar un proyecto con `git`, subirlo a GitHub con `gh` y, si aplica, publicar un **Release** con el artefacto compilado. Sirve para cualquier tipo de proyecto (npm/Node, Vue 3, Electron, Flutter Android/Windows, Go, HTML/vanilla). El agente ejecuta los comandos; este documento es la guía de decisión y secuencia.

## Cuándo usar

Cuando el usuario pide, en un proyecto que está en una carpeta local, **iniciar git, subirlo a GitHub y/o publicar una release** con el binario/instalador. Incluye el caso del proyecto actual (`markdown-mermaid`, Electron + Vue 3): generar `dist\*Setup*.exe` y publicarlo como release.

## Prerrequisitos

| Herramienta | Para qué |
| ----------- | -------- |
| Git         | Control de versiones |
| GitHub CLI (`gh`) | Crear repositorio y releases |
| Node/npm, Flutter o Go | Compilar según el tipo de proyecto (solo si se pide release) |

Autenticación (una vez por máquina):

```bash
gh auth login
```

Verificar sesión activa antes de empezar: `gh auth status`.

## Paso 0 — Analizar el proyecto

Identificar el tipo de proyecto para saber qué compilar y qué artefactos publicar. No asumir: mirar los archivos reales.

| Señal                     | Tipo                    | Build / artefacto para release                                          |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `package.json` + scripts `build:win` / `electron-builder.yml` | Electron | `npm run build:win` → `dist\*Setup*.exe` (NSIS) y `dist\win-unpacked\`  |
| `package.json` con build (Vue/Vite, etc.) | Vue 3 / SPA | `npm run build` → `dist/` (subir `dist` zip o el source como release)   |
| `pubspec.yaml`            | Flutter Android/Windows | Android: `flutter build apk --release` → `build\app\outputs\flutter-apk\app-release.apk`; Windows: `flutter build windows` → `build\windows\x64\runner\Release\` (empaquetar en `.zip`) |
| `go.mod`                  | Go                      | `go build` (o cross-compile con `GOOS`/`GOARCH`) → binarios por plataforma |
| Solo `.html`/estáticos    | HTML/vanilla            | Sin build; opcional un `.zip` del proyecto como asset                   |

- Versión actual: en npm leer `version` de `package.json`; en Flutter leer `version:` de `pubspec.yaml`; en Go/otros usar un tag manual (p. ej. `v0.1.0`).
- Si no hay repo remoto configurado, seguir los pasos 1–4. Si ya existe remoto, ir directo a push (paso 4) y, si se pide, release.

## Paso 1 — `.gitignore`

Comprobar si existe; si no, crearlo con lo que no debe versionarse según el tipo:

- Node/npm/Electron: `node_modules/`, `out/`, `dist/`, `*.log`
- Flutter: `build/`, `.dart_tool/`, `.flutter-plugins*`
- Go: el binario compilado (`*.exe`, el nombre del binario)
- General: `.vscode/` (salvo `extensions.json`), `Thumbs.db`, `Desktop.ini`

> Regla: **no versionar artefactos de build ni dependencias** (`node_modules/`, `out/`, `dist/`, `build/`). Los binarios/instaladores se publican como **assets de la Release**, no como código.

## Paso 2 — Inicializar y primer commit

```bash
git init -b main
git add -A
git status          # COMPROBAR que NO aparecen node_modules/ ni out/ ni dist/ ni build/
git commit -m "chore: inicializar proyecto"
```

- `git init -b main` ya crea la rama `main` (no hace falta `git branch -M main` a menos que el repo ya tuviera `master`).
- Si el repo ya estaba inicializado y en `master`: `git branch -M main`.

## Paso 3 — Crear el repositorio en GitHub

```bash
gh repo create <nombre> --public --source . --remote origin --push
```

- `<nombre>`: derivar del nombre de la carpeta o del campo `name` de `package.json` (sanitizar: minúsculas, guiones, sin espacios).
- Visibilidad: **preguntar al usuario** `--public` o `--private` si no lo especifica.
- `--source .` crea el repo desde la carpeta actual; `--push` sube la rama activa y fija `origin`.
- Si ya existe `origin`: omitir `--remote origin` y usar `git push -u origin main`.
- Si el repo ya existe en GitHub: no volver a crearlo; añadir `origin` y hacer push.

## Paso 4 — Push

```bash
git push -u origin main
```

## Paso 5 — Release (opcional; solo si se pide)

> Toda release necesita: (1) versión subida en el manifiesto, (2) artefacto compilado, (3) tag. El tag se crea automáticamente con `gh release create`; **no debe existir ya** (si existe, subir versión).

### 5.1 Subir la versión

- npm: editar `version` en `package.json` (p. ej. `0.2.0`). No usar `npm version` con tag automático salvo que el usuario lo pida.
- Flutter: subir la parte semántica de `version:` en `pubspec.yaml`.
- Go/HTML/otros: definir el tag directamente (`v0.1.0`, `v0.2.0`, …).

### 5.2 Compilar el artefacto

Según la tabla del paso 0 (p. ej. `npm run build:win`, `flutter build apk --release`, `go build`). Verificar que el artefacto existe con `Test-Path` / `ls` antes de publicar.

### 5.3 Publicar la release

```bash
gh release create v0.2.0 "dist\Markdown Mermaid Setup 0.2.0.exe" \
  --repo <owner>/<repo> \
  --title "Nombre v0.2.0" \
  --notes "## Cambios...\n- ..."
```

- Múltiples assets: pasar las rutas separadas tras el tag.
- Notas largas: escribir a un archivo temporal y usar `--notes-file <ruta>`.
- **Windows/PowerShell**: no hay `&&`; encadenar con `;` o `if ($?) { … }`. Poner rutas con espacios entre comillas.

### 5.4 Si la subida se interrumpe (release en borrador)

```bash
gh release upload v0.2.0 "ruta\al.exe" --repo <owner>/<repo>
gh release edit v0.2.0 --repo <owner>/<repo> --draft=false
```

## Verificación final

```bash
gh repo view <owner>/<repo>          # repo creado/subido
gh release view v0.2.0 --repo <owner>/<repo> --json isDraft,assets --jq '{isDraft, assets: [.assets[] | .name]}'
```

- Debe devolver `"isDraft": false` y el nombre del asset.

## Errores frecuentes y solución

| Síntoma | Causa | Solución |
| ------- | ----- | -------- |
| `gh` pide login / "auth" falla | Sin sesión | `gh auth login` |
| Push rechazado por rama | Rama `master` en vez de `main` | `git branch -M main` y `git push -u origin main` |
| `git remote add` falla ("origin already exists") | Ya hay remoto | Usar `git push -u origin main` directamente |
| Release falla ("tag already exists") | Tag `v…` ya publicado | Subir versión y usar tag nuevo |
| `git status` muestra `node_modules/`/`dist/` | Falta `.gitignore` | Añadir las carpetas y `git rm -r --cached` si ya se commitearon |
| Artefacto muy grande | Binario no comprimido | Subir solo el instalador/`.zip`/`.apk`; timeout amplio en `gh release create` |
| SmartScreen/Windows bloquea el instalador | Binario sin firmar | Documentar "Más información → Ejecutar de todas formas" o firmar con certificado |

## Notas

- El commit/push/release solo se ejecuta **cuando el usuario lo pide**; no versionar ni subir por iniciativa propia.
- Preguntar antes de publicar si el repo debe ser `--public` o `--private`.
- Para el proyecto actual (Electron), el flujo completo de release está detallado también en `docs/guia-release.md`.
- Esta skill proviene del proyecto `markdown-mermaid`; versiones y arquitectura en `docs/plan-implementacion.md` y `docs/arquitectura.md`.

import mermaid from 'mermaid'
import { downloadSvg, downloadSvgAsPng } from './diagramDownload'

let initialized = false

export function initializeMermaid() {
  if (initialized) return
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' })
  initialized = true
}

let renderToken = 0

function diagramFileName(index, type, ext) {
  const name = `diagrama-${index + 1}`
  return type ? `${name}-${type}.${ext}` : `${name}.${ext}`
}

function attachDiagramActions(pre, index, type) {
  const svg = pre.querySelector('svg')
  if (!svg) return

  const bar = document.createElement('div')
  bar.className = 'diagram-toolbar'

  const svgBtn = document.createElement('button')
  svgBtn.type = 'button'
  svgBtn.className = 'diagram-btn'
  svgBtn.textContent = 'SVG'
  svgBtn.title = 'Descargar como SVG'
  svgBtn.addEventListener('click', () => {
    downloadSvg(svg, diagramFileName(index, type, 'svg'))
  })

  const pngBtn = document.createElement('button')
  pngBtn.type = 'button'
  pngBtn.className = 'diagram-btn'
  pngBtn.textContent = 'PNG'
  pngBtn.title = 'Descargar como PNG'
  pngBtn.addEventListener('click', () => {
    void downloadSvgAsPng(svg, diagramFileName(index, type, 'png'))
  })

  bar.append(svgBtn, pngBtn)
  pre.appendChild(bar)
}

/**
 * Renders every `pre.mermaid` inside `container` to an SVG, replacing its
 * placeholder content. Identical diagrams are rendered only once. Errors are
 * shown inline and never break the rest of the document.
 *
 * Returns a promise that resolves when all diagrams have been processed.
 */
export async function renderDiagrams(container) {
  const blocks = Array.from(container.querySelectorAll('pre.mermaid'))
  if (blocks.length === 0) return
  console.info(`[mermaid] renderizando ${blocks.length} diagrama(s)`)

  initializeMermaid()
  const token = ++renderToken

  const bySource = new Map()
  for (const block of blocks) {
    const codeEl = block.querySelector('code')
    const source = codeEl?.textContent ?? ''
    const list = bySource.get(source)
    if (list) list.push(block)
    else bySource.set(source, [block])
  }

  const svgCache = new Map()
  const blockIndex = new Map()
  blocks.forEach((block, i) => blockIndex.set(block, i))

  await Promise.all(
    Array.from(bySource.entries()).map(async ([source, targets]) => {
      let renderPromise = svgCache.get(source)
      if (!renderPromise) {
        renderPromise = (async () => {
          try {
            const id = `mmd-${token}-${Math.random().toString(36).slice(2, 9)}`
            return await mermaid.render(id, source)
          } catch (error) {
            console.error('[mermaid] error de render:', error)
            return undefined
          }
        })()
        svgCache.set(source, renderPromise)
      }

      const result = await renderPromise

      // Discard stale renders: the DOM may have been replaced meanwhile.
      for (const target of targets) {
        if (!container.contains(target)) continue
        if (result) {
          target.classList.add('rendered')
          target.innerHTML = result.svg
          result.bindFunctions?.(target)

          let type = ''
          try {
            type = mermaid.detectType(source)
          } catch {
            // unknown diagram type; fall back to no suffix
          }
          attachDiagramActions(target, blockIndex.get(target) ?? 0, type)
        } else {
          target.innerHTML = `<div class="mermaid-error">No se pudo renderizar el diagrama. Revisa la sintaxis.</div>`
        }
      }
    }),
  )
}

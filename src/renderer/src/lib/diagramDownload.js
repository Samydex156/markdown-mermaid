/**
 * Creates a download link and triggers the browser download for the given
 * blob, with an auto-generated fallback filename when none is provided.
 * In the Electron app the blob is sent to the main process, which shows a
 * single native "save as" dialog and writes the file (avoids the double
 * dialog that the browser-download route can produce).
 */
export async function downloadBlob(blob, filename) {
  if (window.electronAPI?.saveFileWithDialog) {
    try {
      const result = await window.electronAPI.saveFileWithDialog(filename, await blob.arrayBuffer())
      return Boolean(result?.ok)
    } catch {
      return false
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

/**
 * Serializes an inline SVG element to a standalone SVG document string.
 * Inline styles (from mermaid) are preserved on the elements, so the diagram
 * keeps its appearance when opened or converted.
 */
export function serializeSvg(svg) {
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(svg.viewBox.baseVal.width))
  clone.setAttribute('height', String(svg.viewBox.baseVal.height))
  return `<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`
}

/**
 * Downloads the given SVG element as an .svg file.
 */
export function downloadSvg(svg, filename) {
  const source = serializeSvg(svg)
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
  downloadBlob(blob, filename)
}

/**
 * Rasterizes the given SVG element to a PNG `Blob`, rendered at `scale`x its
 * viewBox size (default 2x for crisp output).
 */
export async function svgToPngBlob(svg, scale = 2) {
  const xml = new XMLSerializer().serializeToString(svg)
  // Use a data URI instead of an object URL: drawing a blob-backed SVG onto a
  // canvas is treated as tainted in Chrome, while a same-origin data URI is not.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`

  try {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('No se pudo cargar el SVG como imagen'))
      img.src = url
    })

    const width = svg.viewBox.baseVal.width * scale
    const height = svg.viewBox.baseVal.height * scale
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo crear el contexto del canvas')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('No se pudo generar el PNG')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Downloads the given SVG element as a .png raster image, rendered at
 * `scale`x its CSS size (default 2x for crisp output).
 */
export async function downloadSvgAsPng(svg, filename, scale = 2) {
  const blob = await svgToPngBlob(svg, scale)
  downloadBlob(blob, filename)
}

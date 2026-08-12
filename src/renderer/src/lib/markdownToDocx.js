import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { md } from './markdown'
import { svgToPngBlob } from './diagramDownload'
import mermaid from 'mermaid'
import { initializeMermaid } from './mermaidRenderer'

const CODE_FONT = 'Consolas'
const MAX_IMAGE_WIDTH = 600 // px, to keep wide diagrams within the page

/**
 * Converts the inline tokens of a paragraph/heading (the `inline` token's
 * `children`) into `TextRun`s, preserving bold/italic/code/link styling.
 */
function inlineRuns(tokens) {
  const runs = []
  let bold = false
  let italics = false
  let link = null
  let linkRuns = []

  const pushRun = (text, opts = {}) => {
    if (text === '') return
    const run = new TextRun({
      text,
      bold: opts.bold ?? bold,
      italics: opts.italics ?? italics,
      font: opts.code ? CODE_FONT : undefined,
    })
    if (link) linkRuns.push(run)
    else runs.push(run)
  }

  for (const tok of tokens) {
    switch (tok.type) {
      case 'text':
        pushRun(tok.content)
        break
      case 'softbreak':
      case 'hardbreak':
        pushRun(' ')
        break
      case 'code_inline':
        pushRun(tok.content, { code: true })
        break
      case 'strong_open':
        bold = true
        break
      case 'strong_close':
        bold = false
        break
      case 'em_open':
        italics = true
        break
      case 'em_close':
        italics = false
        break
      case 'link_open':
        link = tok.attrGet('href') ?? null
        linkRuns = []
        break
      case 'link_close':
        if (link) {
          runs.push(new ExternalHyperlink({ children: linkRuns, link }))
        }
        link = null
        linkRuns = []
        break
      case 'image': {
        // Inline images are not supported in the Word export; render the alt
        // text instead of dropping the content.
        pushRun(tok.content || '')
        break
      }
    }
  }

  // close an unclosed link at the end of the paragraph
  if (link) {
    runs.push(new ExternalHyperlink({ children: linkRuns, link }))
    link = null
  }

  return runs
}

/** Finds the single `inline` token inside a container token's children. */
function inlineChildren(tokens, start, end) {
  for (let i = start; i < end; i++) {
    if (tokens[i].type === 'inline') {
      return tokens[i].children ?? []
    }
  }
  return []
}

/** Builds a docx Table from markdown-it `table_*` tokens. */
function tableFromTokens(tokens, start, end) {
  const rows = []
  let i = start
  while (i < end) {
    if (tokens[i].type === 'tr_open') {
      const cells = []
      let j = i + 1
      while (j < end && tokens[j].type !== 'tr_close') {
        if (tokens[j].type === 'th_open' || tokens[j].type === 'td_open') {
          const cellEnd = tokens[j].type === 'th_open' ? 'th_close' : 'td_close'
          let k = j + 1
          while (k < end && tokens[k].type !== cellEnd) k++
          const cellChildren = inlineChildren(tokens, j + 1, k)
          const paragraph = new Paragraph({
            children: cellChildren.length ? inlineRuns(cellChildren) : [new TextRun('')],
          })
          cells.push(new TableCell({ children: [paragraph] }))
          j = k + 1
        } else {
          j++
        }
      }
      if (cells.length) rows.push(new TableRow({ children: cells }))
      i = j
    } else {
      i++
    }
  }
  if (!rows.length) return null
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  })
}

/**
 * Builds the docx paragraphs for a markdown list (bulleted or ordered),
 * handling nesting. `start`/`end` bound the `*_list_open`..`*_list_close`
 * token range; `level` is the nesting depth used for bullet indentation.
 */
function listParagraphs(tokens, start, end, ordered, level) {
  const out = []
  let i = start
  while (i < end) {
    if (tokens[i].type === 'list_item_open') {
      // Find the item's closing token at the same nesting level.
      let depth = 0
      let close = -1
      for (let j = i; j < end; j++) {
        if (tokens[j].type === 'list_item_open') depth++
        else if (tokens[j].type === 'list_item_close') {
          depth--
          if (depth === 0) {
            close = j
            break
          }
        }
      }
      if (close === -1) break

      // First inline paragraph of the item becomes the bullet/numbered line.
      const inline = inlineChildren(tokens, i + 1, close)
      if (inline.length) {
        out.push(
          new Paragraph({
            children: inlineRuns(inline),
            bullet: ordered ? undefined : { level },
            numbering: ordered ? { reference: 'ordered-list', level } : undefined,
          }),
        )
      }

      // Nested lists inside this item produce indented paragraphs.
      for (let j = i + 1; j < close; j++) {
        if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') {
          const nested = tokens[j].type === 'bullet_list_open'
          let nestedEnd = j + 1
          let nestedDepth = 1
          while (nestedEnd < close) {
            if (tokens[nestedEnd].type === 'bullet_list_open' || tokens[nestedEnd].type === 'ordered_list_open') nestedDepth++
            else if (tokens[nestedEnd].type === 'bullet_list_close' || tokens[nestedEnd].type === 'ordered_list_close') {
              nestedDepth--
              if (nestedDepth === 0) break
            }
            nestedEnd++
          }
          out.push(...listParagraphs(tokens, j + 1, nestedEnd, nested, level + 1))
          j = nestedEnd
        }
      }

      i = close + 1
    } else {
      i++
    }
  }
  return out
}

/**
 * Renders every mermaid diagram in the source to a PNG blob, deduplicating by
 * source. Failed diagrams return `null` (caller falls back to code text).
 */
async function renderMermaidPngs(source) {
  const map = new Map()
  const tokens = md.parse(source, {})
  const fenceTokens = tokens.filter(
    (t) => t.type === 'fence' && (t.info.trim().split(/\s+/)[0] ?? '') === 'mermaid',
  )

  initializeMermaid()
  await Promise.all(
    fenceTokens.map(async (tok) => {
      if (map.has(tok.content)) return
      try {
        const id = `mmd-${Math.random().toString(36).slice(2, 9)}`
        const { svg } = await mermaid.render(id, tok.content)
        const container = document.createElement('div')
        container.innerHTML = svg
        const svgEl = container.querySelector('svg')
        if (!svgEl) {
          map.set(tok.content, null)
          return
        }
        const blob = await svgToPngBlob(svgEl)
        map.set(tok.content, blob)
      } catch {
        map.set(tok.content, null)
      }
    }),
  )
  return map
}

/** Returns the width/height (in px) to embed a diagram at, capping the width. */
async function imageSize(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('No se pudo cargar el PNG'))
      img.src = url
    })
    const ratio = img.height > 0 ? img.width / img.height : 1
    // The PNG was rasterized at 2x; keep the display size at 1x so the image
    // is not oversized in Word, preserving the aspect ratio.
    const width = Math.min(img.width / 2, MAX_IMAGE_WIDTH)
    const height = width / ratio
    return { width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Converts a Markdown source string into docx `Paragraph`/`Table` children,
 * embedding mermaid diagrams as PNG images.
 */
export async function buildDocxChildren(source) {
  const tokens = md.parse(source, {})
  const pngs = await renderMermaidPngs(source)
  const children = []

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    switch (tok.type) {
      case 'heading_open': {
        const level = Math.min(Number(tok.tag.slice(1)) || 1, 6)
        const heading = HeadingLevel[`HEADING_${level}`]
        const closeIdx = tokens.findIndex((t, j) => j > i && t.type === 'heading_close')
        const content = inlineChildren(tokens, i + 1, closeIdx)
        children.push(
          new Paragraph({
            heading,
            children: content.length ? inlineRuns(content) : [new TextRun('')],
          }),
        )
        i = closeIdx === -1 ? i : closeIdx
        break
      }
      case 'paragraph_open': {
        const closeIdx = tokens.findIndex((t, j) => j > i && t.type === 'paragraph_close')
        const content = inlineChildren(tokens, i + 1, closeIdx)
        children.push(
          new Paragraph({
            children: content.length ? inlineRuns(content) : [new TextRun('')],
          }),
        )
        i = closeIdx === -1 ? i : closeIdx
        break
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = tok.type === 'ordered_list_open'
        let depth = 0
        let close = -1
        for (let j = i; j < tokens.length; j++) {
          if (tokens[j].type === 'bullet_list_open' || tokens[j].type === 'ordered_list_open') depth++
          else if (tokens[j].type === 'bullet_list_close' || tokens[j].type === 'ordered_list_close') {
            depth--
            if (depth === 0) {
              close = j
              break
            }
          }
        }
        const end = close === -1 ? tokens.length : close
        children.push(...listParagraphs(tokens, i + 1, end, ordered, 0))
        i = end
        break
      }
      case 'blockquote_open': {
        const closeIdx = tokens.findIndex((t, j) => j > i && t.type === 'blockquote_close')
        const content = inlineChildren(tokens, i + 1, closeIdx)
        children.push(
          new Paragraph({
            children: content.length ? inlineRuns(content) : [new TextRun('')],
            indent: { left: 720 },
            style: 'IntenseQuote',
          }),
        )
        i = closeIdx === -1 ? i : closeIdx
        break
      }
      case 'table_open': {
        const close = tokens.findIndex((t, j) => j > i && t.type === 'table_close')
        const table = tableFromTokens(tokens, i + 1, close === -1 ? tokens.length : close)
        if (table) children.push(table)
        i = close === -1 ? tokens.length - 1 : close
        break
      }
      case 'fence':
      case 'code_block': {
        const lang = tok.info.trim().split(/\s+/)[0] || ''
        if (lang === 'mermaid') {
          const png = pngs.get(tok.content) ?? null
          if (png) {
            const { width, height } = await imageSize(png)
            children.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    type: 'png',
                    data: await png.arrayBuffer(),
                    transformation: { width, height },
                  }),
                ],
              }),
            )
          } else {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: tok.content, font: CODE_FONT, size: 18 }),
                ],
              }),
            )
          }
        } else {
          const lines = tok.content.replace(/\n$/, '').split('\n')
          children.push(
            new Paragraph({
              children: lines.map(
                (line, idx) =>
                  new TextRun({ text: line, font: CODE_FONT, size: 18, break: idx > 0 ? 1 : 0 }),
              ),
            }),
          )
        }
        break
      }
      case 'hr':
        children.push(new Paragraph({ children: [new TextRun({ text: '─'.repeat(40) })] }))
        break
      case 'html_block':
        // Raw HTML cannot be embedded faithfully; skip it.
        break
      case 'inline': {
        // Bare inline outside a paragraph (rare); render as its own paragraph.
        children.push(new Paragraph({ children: inlineRuns(tok.children ?? []) }))
        break
      }
    }
  }

  return children
}

/**
 * Generates a `.docx` Blob from a Markdown source string, ready to download.
 */
export async function markdownToDocx(source) {
  const children = await buildDocxChildren(source)
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.START },
            { level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.', alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [
      {
        children,
      },
    ],
  })
  return Packer.toBlob(doc)
}

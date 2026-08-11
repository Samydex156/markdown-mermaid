import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch {
        // fall through to default escaping
      }
    }
    return ''
  },
})

// Custom fence renderer: blocks tagged ```mermaid render as diagram placeholders.
const defaultFence = md.renderer.rules.fence

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const info = token.info.trim()
  const lang = info.split(/\s+/)[0] || ''

  if (lang === 'mermaid') {
    return `<pre class="mermaid"><code class="language-mermaid">${token.content}</code></pre>`
  }
  return defaultFence(tokens, idx, options, env, self)
}

export function renderMarkdown(source) {
  const raw = md.render(source)
  return DOMPurify.sanitize(raw)
}

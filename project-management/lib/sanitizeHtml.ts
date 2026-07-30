/**
 * Allowlist HTML sanitizer for comment bodies — no external dependencies.
 */

const ALLOWED_TAGS = new Set([
  'p',
  'strong',
  'em',
  'u',
  'code',
  'pre',
  'blockquote',
  'a',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'br',
  'span',
  'div',
  'img',
])

const GLOBAL_ATTRS = new Set(['class', 'style'])
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  span: new Set(['data-mention-user-id', 'data-mention-token', 'contenteditable']),
  div: new Set(['data-reply-to']),
  img: new Set(['src', 'alt']),
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (!ALLOWED_TAGS.has(tag)) {
    return escapeText(el.textContent ?? '')
  }

  if (tag === 'img') {
    const src = el.getAttribute('src') ?? ''
    if (!src.startsWith('data:')) return ''
  }

  if (tag === 'a') {
    const href = el.getAttribute('href') ?? ''
    if (/^\s*javascript:/i.test(href)) return escapeText(el.textContent ?? '')
  }

  const allowed = TAG_ATTRS[tag] ?? new Set<string>()
  const attrs: string[] = []
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    if (!GLOBAL_ATTRS.has(name) && !allowed.has(name)) continue
    if (name.startsWith('on')) continue
    attrs.push(`${name}="${escapeText(attr.value)}"`)
  }

  if (tag === 'a') {
    if (!attrs.some((a) => a.startsWith('target='))) attrs.push('target="_blank"')
    if (!attrs.some((a) => a.startsWith('rel='))) attrs.push('rel="noopener noreferrer"')
  }

  const inner = Array.from(el.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? '')
      if (node.nodeType === Node.ELEMENT_NODE) return sanitizeElement(node as Element)
      return ''
    })
    .join('')

  if (tag === 'br') return '<br/>'
  return `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>${inner}</${tag}>`
}

/** Strip unsafe HTML; keep allowlisted tags and attributes. */
export function sanitizeHtml(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  if (typeof DOMParser === 'undefined') {
    return escapeText(trimmed.replace(/<[^>]*>/g, ''))
  }

  const doc = new DOMParser().parseFromString(`<div>${trimmed}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return escapeText(trimmed)

  return Array.from(root.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? '')
      if (node.nodeType === Node.ELEMENT_NODE) return sanitizeElement(node as Element)
      return ''
    })
    .join('')
    .trim()
}

import type { JSONContent } from '@tiptap/core'
import { mergeAttributes, Node } from '@tiptap/core'

import type { InkwiseCitation, InkwiseCitationStyle } from '@/lib/api'
import { normalizeInkwiseCitationStyle } from '@/lib/inkwise-citation-format'

export const INKWISE_CITATION_ANCHOR_NODE = 'inkwiseCitationAnchor'

export type InkwiseCitationAnchorSourceKind = 'chat' | 'writing_tool' | 'prediction'

export type InkwiseCitationAnchorAttrs = {
  anchorId: string
  sourceKind: InkwiseCitationAnchorSourceKind
  citationStyle: InkwiseCitationStyle
  attemptId?: string | null
  retrievalRunId?: string | null
  createdAt: string
  citations: InkwiseCitation[]
}

const TEXTBLOCK_TYPES = new Set(['paragraph', 'heading'])
const EVIDENCE_MARKER_RE = /\[(E\d{2})\]/g

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function parseStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseCitations(value: unknown): InkwiseCitation[] {
  if (!Array.isArray(value)) return []
  return value.filter((item) => Boolean(item && typeof item === 'object')) as InkwiseCitation[]
}

function buildAnchorNode(attrs: InkwiseCitationAnchorAttrs): JSONContent {
  return {
    type: INKWISE_CITATION_ANCHOR_NODE,
    attrs,
  }
}

function buildTextNode(text: string, template?: JSONContent): JSONContent {
  return {
    ...(template || {}),
    type: 'text',
    text,
  }
}

function appendAnchorToLastTextblock(node: JSONContent, attrs: InkwiseCitationAnchorAttrs): boolean {
  if (node.type && TEXTBLOCK_TYPES.has(node.type)) {
    node.content = [...(node.content ?? []), buildAnchorNode(attrs)]
    return true
  }

  if (!Array.isArray(node.content) || !node.content.length) return false

  for (let index = node.content.length - 1; index >= 0; index -= 1) {
    const child = node.content[index]
    if (appendAnchorToLastTextblock(child, attrs)) {
      return true
    }
  }

  return false
}

export function hasInkwiseCitations(citations: InkwiseCitation[] | null | undefined): boolean {
  return Array.isArray(citations) && citations.some((citation) => Boolean(citation?.evidence_id || citation?.excerpt))
}

export function createInkwiseCitationAnchorAttrs({
  citations,
  sourceKind,
  citationStyle,
  attemptId,
  retrievalRunId,
}: {
  citations: InkwiseCitation[]
  sourceKind: InkwiseCitationAnchorSourceKind
  citationStyle?: InkwiseCitationStyle | null
  attemptId?: string | null
  retrievalRunId?: string | null
}): InkwiseCitationAnchorAttrs {
  return {
    anchorId: globalThis.crypto?.randomUUID?.() || `inkwise-citation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sourceKind,
    citationStyle: normalizeInkwiseCitationStyle(citationStyle),
    attemptId: attemptId || null,
    retrievalRunId: retrievalRunId || null,
    createdAt: new Date().toISOString(),
    citations: citations.filter((citation) => Boolean(citation && typeof citation === 'object')),
  }
}

export function appendCitationAnchorToContent(
  content: JSONContent | null | undefined,
  attrs: InkwiseCitationAnchorAttrs,
): JSONContent {
  const doc = JSON.parse(JSON.stringify(content && content.type === 'doc' ? content : { type: 'doc', content: [] })) as JSONContent

  if (!appendAnchorToLastTextblock(doc, attrs)) {
    doc.content = [
      ...(doc.content ?? []),
      {
        type: 'paragraph',
        content: [buildAnchorNode(attrs)],
      },
    ]
  }

  return doc
}

function splitTextNodeByCitationMarkers({
  node,
  citationById,
  sourceKind,
  citationStyle,
  attemptId,
  retrievalRunId,
}: {
  node: JSONContent
  citationById: Map<string, InkwiseCitation>
  sourceKind: InkwiseCitationAnchorSourceKind
  citationStyle?: InkwiseCitationStyle | null
  attemptId?: string | null
  retrievalRunId?: string | null
}): { nodes: JSONContent[]; inserted: boolean } {
  const text = typeof node.text === 'string' ? node.text : ''
  if (!text) return { nodes: [node], inserted: false }

  EVIDENCE_MARKER_RE.lastIndex = 0
  const parts: JSONContent[] = []
  let cursor = 0
  let inserted = false

  while (cursor < text.length) {
    EVIDENCE_MARKER_RE.lastIndex = cursor
    const match = EVIDENCE_MARKER_RE.exec(text)
    if (!match) break

    if (match.index > cursor) {
      parts.push(buildTextNode(text.slice(cursor, match.index), node))
    }

    const citationIds: string[] = []
    let nextCursor = match.index
    while (true) {
      EVIDENCE_MARKER_RE.lastIndex = nextCursor
      const nextMatch = EVIDENCE_MARKER_RE.exec(text)
      if (!nextMatch || nextMatch.index !== nextCursor) break
      const evidenceId = nextMatch[1]
      if (citationById.has(evidenceId) && !citationIds.includes(evidenceId)) {
        citationIds.push(evidenceId)
      }
      nextCursor = nextMatch.index + nextMatch[0].length
    }

    if (citationIds.length) {
      parts.push(
        buildAnchorNode(
          createInkwiseCitationAnchorAttrs({
            citations: citationIds.map((citationId) => citationById.get(citationId)).filter(Boolean) as InkwiseCitation[],
            sourceKind,
            citationStyle,
            attemptId,
            retrievalRunId,
          }),
        ),
      )
      inserted = true
    } else {
      parts.push(buildTextNode(text.slice(match.index, nextCursor), node))
    }

    cursor = nextCursor
  }

  if (cursor < text.length) {
    parts.push(buildTextNode(text.slice(cursor), node))
  }

  if (!inserted) {
    return { nodes: [node], inserted: false }
  }

  return {
    nodes: parts.filter((part) => !(part.type === 'text' && !part.text)),
    inserted: true,
  }
}

export function injectCitationAnchorsFromMarkedContent({
  content,
  citations,
  sourceKind,
  citationStyle,
  attemptId,
  retrievalRunId,
}: {
  content: JSONContent | null | undefined
  citations: InkwiseCitation[]
  sourceKind: InkwiseCitationAnchorSourceKind
  citationStyle?: InkwiseCitationStyle | null
  attemptId?: string | null
  retrievalRunId?: string | null
}): { content: JSONContent; inserted: boolean } {
  const doc = JSON.parse(JSON.stringify(content && content.type === 'doc' ? content : { type: 'doc', content: [] })) as JSONContent
  const citationById = new Map(
    citations
      .filter((citation) => citation?.evidence_id)
      .map((citation) => [String(citation.evidence_id), citation] as const),
  )
  let inserted = false

  function visit(node: JSONContent): JSONContent[] {
    if (node.type === 'text') {
      const result = splitTextNodeByCitationMarkers({ node, citationById, sourceKind, citationStyle, attemptId, retrievalRunId })
      inserted = inserted || result.inserted
      return result.nodes
    }

    if (!Array.isArray(node.content) || !node.content.length) {
      return [node]
    }

    const nextContent = node.content.flatMap((child) => visit(child))
    return [{ ...node, content: nextContent }]
  }

  const nextContent = Array.isArray(doc.content) ? doc.content.flatMap((child) => visit(child)) : []
  return {
    content: { ...doc, content: nextContent },
    inserted,
  }
}

export function extractInsertableContent(content: JSONContent | null | undefined): JSONContent | JSONContent[] {
  if (!content) return { type: 'paragraph' }
  return content.type === 'doc' ? (content.content ?? []) : content
}

export const InkwiseCitationAnchorNode = Node.create({
  name: INKWISE_CITATION_ANCHOR_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      anchorId: {
        default: null,
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-anchor-id')),
      },
      sourceKind: {
        default: 'writing_tool',
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-source-kind')) || 'writing_tool',
      },
      citationStyle: {
        default: 'default',
        parseHTML: (element: HTMLElement) => normalizeInkwiseCitationStyle(parseStringValue(element.getAttribute('data-citation-style'))),
      },
      attemptId: {
        default: null,
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-attempt-id')),
      },
      retrievalRunId: {
        default: null,
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-retrieval-run-id')),
      },
      createdAt: {
        default: null,
        parseHTML: (element: HTMLElement) => parseStringValue(element.getAttribute('data-created-at')),
      },
      citations: {
        default: [],
        parseHTML: (element: HTMLElement) => parseCitations(parseJson(element.getAttribute('data-citations'), [] as InkwiseCitation[])),
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'inkwise-citation-anchor' },
      { tag: 'span[data-inkwise-citation-anchor="true"]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const citations = parseCitations(HTMLAttributes.citations)
    const attrs = {
      'data-inkwise-citation-anchor': 'true',
      'data-anchor-id': parseStringValue(HTMLAttributes.anchorId) || '',
      'data-source-kind': parseStringValue(HTMLAttributes.sourceKind) || 'writing_tool',
      'data-citation-style': normalizeInkwiseCitationStyle(parseStringValue(HTMLAttributes.citationStyle)),
      'data-attempt-id': parseStringValue(HTMLAttributes.attemptId) || '',
      'data-retrieval-run-id': parseStringValue(HTMLAttributes.retrievalRunId) || '',
      'data-created-at': parseStringValue(HTMLAttributes.createdAt) || '',
      'data-citations': JSON.stringify(citations),
      contenteditable: 'false',
    }

    return ['inkwise-citation-anchor', mergeAttributes(attrs)]
  },
})

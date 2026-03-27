import type { JSONContent } from '@tiptap/core'
import { mergeAttributes, Node } from '@tiptap/core'

import type { InkwiseCitation } from '@/lib/api'

export const INKWISE_CITATION_ANCHOR_NODE = 'inkwiseCitationAnchor'

export type InkwiseCitationAnchorSourceKind = 'chat' | 'writing_tool' | 'prediction'

export type InkwiseCitationAnchorAttrs = {
  anchorId: string
  sourceKind: InkwiseCitationAnchorSourceKind
  attemptId?: string | null
  retrievalRunId?: string | null
  createdAt: string
  citations: InkwiseCitation[]
}

const TEXTBLOCK_TYPES = new Set(['paragraph', 'heading'])

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
  attemptId,
  retrievalRunId,
}: {
  citations: InkwiseCitation[]
  sourceKind: InkwiseCitationAnchorSourceKind
  attemptId?: string | null
  retrievalRunId?: string | null
}): InkwiseCitationAnchorAttrs {
  return {
    anchorId: globalThis.crypto?.randomUUID?.() || `inkwise-citation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sourceKind,
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
      'data-attempt-id': parseStringValue(HTMLAttributes.attemptId) || '',
      'data-retrieval-run-id': parseStringValue(HTMLAttributes.retrievalRunId) || '',
      'data-created-at': parseStringValue(HTMLAttributes.createdAt) || '',
      'data-citations': JSON.stringify(citations),
      contenteditable: 'false',
    }

    return ['inkwise-citation-anchor', mergeAttributes(attrs)]
  },
})

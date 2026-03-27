'use client'

import { Children, Fragment, cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

import { InkwiseCitationBubbles } from '@/components/inkwise/citation-bubbles'
import type { InkwiseCitation } from '@/lib/api'

const INLINE_CITATION_TAGS = ['p', 'li', 'strong', 'em', 'del', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th'] as const
const SKIP_INLINE_CITATION_TAGS = new Set(['a', 'code', 'pre'])
const EVIDENCE_MARKER_RE = /\[(E\d{2})\]/g
const inlineCitationBubbleClassName =
  'rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100'

function renderTextWithInlineCitations(text: string, citationById: Map<string, InkwiseCitation>): ReactNode {
  EVIDENCE_MARKER_RE.lastIndex = 0
  let cursor = 0
  let bubbleIndex = 0
  const parts: ReactNode[] = []

  while (cursor < text.length) {
    EVIDENCE_MARKER_RE.lastIndex = cursor
    const match = EVIDENCE_MARKER_RE.exec(text)
    if (!match) break

    if (match.index > cursor) {
      parts.push(text.slice(cursor, match.index))
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
        <span key={`inline-citation-${bubbleIndex}`} className="mx-1 inline-flex align-middle">
          <InkwiseCitationBubbles
            citations={citationIds.map((citationId) => citationById.get(citationId)).filter(Boolean) as InkwiseCitation[]}
            inline
            compactLabels
            bubbleClassName={inlineCitationBubbleClassName}
          />
        </span>,
      )
      bubbleIndex += 1
    } else {
      parts.push(text.slice(match.index, nextCursor))
    }

    cursor = nextCursor
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }

  return parts.length ? parts : text
}

function renderChildrenWithInlineCitations(children: ReactNode, citationById: Map<string, InkwiseCitation>, allowInlineCitations: boolean): ReactNode {
  return Children.map(children, (child, index) => {
    if (typeof child === 'string') {
      return allowInlineCitations ? <Fragment key={`text-${index}`}>{renderTextWithInlineCitations(child, citationById)}</Fragment> : child
    }

    if (!isValidElement<{ children?: ReactNode }>(child)) {
      return child
    }

    const typedChild = child as ReactElement<{ children?: ReactNode }>
    const childType = typeof child.type === 'string' ? child.type : null
    const childAllowsInlineCitations = allowInlineCitations && !SKIP_INLINE_CITATION_TAGS.has(childType || '')
    const childChildren = typedChild.props.children
    if (childChildren === undefined) {
      return typedChild
    }

    return cloneElement(typedChild, {
      key: typedChild.key ?? `node-${index}`,
      children: renderChildrenWithInlineCitations(childChildren, citationById, childAllowsInlineCitations),
    })
  })
}

type InkwiseMarkdownViewProps = {
  markdown: string
  className?: string
  citations?: InkwiseCitation[]
  renderInlineCitations?: boolean
}

export function InkwiseMarkdownView({ markdown, className, citations, renderInlineCitations = false }: InkwiseMarkdownViewProps) {
  const citationById = new Map(
    (citations || [])
      .filter((citation) => citation?.evidence_id)
      .map((citation) => [String(citation.evidence_id), citation] as const),
  )

  const components = Object.fromEntries(
    INLINE_CITATION_TAGS.map((tagName) => [
      tagName,
      ({ node: _node, children, ...props }: { node?: unknown; children?: ReactNode }) => {
        const Tag = tagName
        return <Tag {...props}>{renderChildrenWithInlineCitations(children, citationById, renderInlineCitations)}</Tag>
      },
    ]),
  )

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          ...components,
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        }}
      >
        {markdown || ''}
      </ReactMarkdown>
    </div>
  )
}

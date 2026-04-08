'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'

import { InkwiseCitationBubbles } from '@/components/inkwise/citation-bubbles'
import {
  hasInkwiseCitations,
  InkwiseCitationAnchorNode,
  type InkwiseCitationAnchorAttrs,
} from '@/lib/inkwise-citation-anchor'
import { convertCitationAnchorReference } from '@/lib/inkwise-editor'

function InkwiseCitationAnchorView({ node, editor, getPos }: NodeViewProps) {
  const attrs = (node.attrs || {}) as Partial<InkwiseCitationAnchorAttrs>
  const citations = Array.isArray(attrs.citations) ? attrs.citations : []

  if (!hasInkwiseCitations(citations)) {
    return <NodeViewWrapper as="span" className="hidden" contentEditable={false} />
  }

  const referenceActions = [
    { id: 'inline', label: 'Inline Reference', variant: 'default' as const },
    { id: 'footnote', label: 'Footnote Reference' },
    { id: 'endnote', label: 'Endnote Reference' },
  ].map((action) => ({
    ...action,
    onClick: () => {
      const position = typeof getPos === 'function' ? getPos() : null
      if (typeof position !== 'number') {
        throw new Error('Could not locate the citation bubble in the editor.')
      }
      const converted = convertCitationAnchorReference({
        editor,
        from: position,
        to: position + node.nodeSize,
        citations,
        mode: action.id as 'inline' | 'footnote' | 'endnote',
      })
      if (!converted) {
        throw new Error('Could not convert this reference.')
      }
    },
  }))

  return (
    <NodeViewWrapper as="span" className="mx-1 inline-flex align-middle" contentEditable={false}>
      <InkwiseCitationBubbles
        citations={citations}
        inline
        compactLabels
        referenceActions={referenceActions}
        bubbleClassName="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
      />
    </NodeViewWrapper>
  )
}

export const InkwiseCitationAnchorEditorNode = InkwiseCitationAnchorNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InkwiseCitationAnchorView)
  },
})

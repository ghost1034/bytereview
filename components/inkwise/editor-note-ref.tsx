'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { useCallback, useMemo } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { INKWISE_NOTE_DEFINITION_NODE, INKWISE_NOTE_REF_NODE, InkwiseNoteRefNode } from '@/lib/inkwise-editor-extensions'

function findNoteDefinitionText(editor: NodeViewProps['editor'], noteId: string): string | null {
  if (!noteId) return null
  let text: string | null = null
  editor.state.doc.descendants((node) => {
    if (text !== null) return false
    if (node.type.name === INKWISE_NOTE_DEFINITION_NODE && node.attrs.noteId === noteId) {
      text = node.textContent || ''
      return false
    }
  })
  return text
}

function findNoteDefinitionPos(editor: NodeViewProps['editor'], noteId: string): number | null {
  if (!noteId) return null
  let result: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (result !== null) return false
    if (node.type.name === INKWISE_NOTE_DEFINITION_NODE && node.attrs.noteId === noteId) {
      result = pos
      return false
    }
  })
  return result
}

function InkwiseNoteRefView({ node, editor }: NodeViewProps) {
  const noteId = (node.attrs.noteId as string) || ''
  const noteNumber = Number(node.attrs.noteNumber) || 1
  const noteKind = (node.attrs.noteKind as string) || 'footnote'

  const tooltipText = useMemo(() => {
    const text = findNoteDefinitionText(editor, noteId)
    if (text === null) return 'Note not found'
    if (!text) return `Empty ${noteKind}`
    return text.length > 200 ? `${text.slice(0, 197).trimEnd()}...` : text
  }, [editor, noteId, noteKind])

  const scrollToDefinition = useCallback(() => {
    const pos = findNoteDefinitionPos(editor, noteId)
    if (pos === null) return
    editor.commands.focus()
    editor.commands.setTextSelection(pos + 1)
    editor.commands.scrollIntoView()
  }, [editor, noteId])

  return (
    <NodeViewWrapper as="span" className="inline" contentEditable={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="button"
            tabIndex={-1}
            className="cursor-pointer text-[0.7em] font-semibold text-blue-600 align-super hover:text-blue-800 hover:underline"
            onClick={scrollToDefinition}
            data-inkwise-note-ref="true"
            data-note-id={noteId}
            data-note-kind={noteKind}
            data-note-number={noteNumber}
          >
            {noteNumber}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </NodeViewWrapper>
  )
}

export const InkwiseNoteRefEditorNode = InkwiseNoteRefNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InkwiseNoteRefView)
  },
})

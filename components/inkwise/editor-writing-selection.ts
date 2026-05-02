'use client'

import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import type { InkwiseEditorTarget } from '@/lib/inkwise-editor'

type WritingSelectionRange = {
  from: number
  to: number
}

type WritingSelectionMeta = WritingSelectionRange | 'clear'

const writingSelectionPluginKey = new PluginKey<WritingSelectionRange | null>('inkwiseWritingSelection')

function normalizeRange(state: EditorState, range: WritingSelectionRange): WritingSelectionRange | null {
  const max = state.doc.content.size
  const from = Math.max(0, Math.min(range.from, max))
  const to = Math.max(0, Math.min(range.to, max))
  if (from >= to) return null
  if (!state.doc.textBetween(from, to, '\n').trim()) return null
  return { from, to }
}

export function createWritingSelectionHighlightExtension() {
  return Extension.create({
    name: 'inkwiseWritingSelection',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: writingSelectionPluginKey,
          state: {
            init: () => null,
            apply(tr: Transaction, value: WritingSelectionRange | null, _oldState: EditorState, newState: EditorState) {
              const meta = tr.getMeta(writingSelectionPluginKey) as WritingSelectionMeta | undefined
              if (meta === 'clear') return null
              if (meta) return normalizeRange(newState, meta)
              if (!value || !tr.docChanged) return value

              return normalizeRange(newState, {
                from: tr.mapping.map(value.from, 1),
                to: tr.mapping.map(value.to, -1),
              })
            },
          },
          props: {
            decorations(state: EditorState) {
              const range = writingSelectionPluginKey.getState(state)
              if (!range) return null

              return DecorationSet.create(state.doc, [
                Decoration.inline(range.from, range.to, {
                  class: 'inkwise-writing-selection-highlight',
                }),
              ])
            },
          },
        }),
      ]
    },
  })
}

export function setWritingSelectionHighlight(editor: Editor | null, target: InkwiseEditorTarget | null | undefined) {
  if (!editor?.view || !target?.hasSelection) return
  editor.view.dispatch(editor.state.tr.setMeta(writingSelectionPluginKey, { from: target.from, to: target.to }))
}

export function clearWritingSelectionHighlight(editor: Editor | null) {
  if (!editor?.view) return
  editor.view.dispatch(editor.state.tr.setMeta(writingSelectionPluginKey, 'clear'))
}

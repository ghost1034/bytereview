'use client'

import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

const predictionPluginKey = new PluginKey('inkwisePrediction')

type PredictionExtensionOptions = {
  getSuggestion: () => string
  onAccept: () => void
  onDismiss: () => void
}

export function createPredictionExtension(options: PredictionExtensionOptions) {
  return Extension.create({
    name: 'inkwisePrediction',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: predictionPluginKey,
          state: {
            init: () => 0,
            apply(tr: Transaction, value: number) {
              if (tr.docChanged || tr.selectionSet || tr.getMeta(predictionPluginKey) === 'refresh') {
                return value + 1
              }
              return value
            },
          },
          props: {
            decorations(state: EditorState) {
              const suggestion = options.getSuggestion()
              if (!suggestion || !state.selection.empty) return null

              const widget = document.createElement('span')
              widget.className = 'pointer-events-none select-none text-slate-400'
              widget.textContent = suggestion

              return DecorationSet.create(state.doc, [
                Decoration.widget(state.selection.from, widget, {
                  side: 1,
                  ignoreSelection: true,
                }),
              ])
            },
            handleKeyDown(_view: EditorView, event: KeyboardEvent) {
              const suggestion = options.getSuggestion()
              if (!suggestion || event.isComposing) return false

              if (!event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && event.key === 'Tab') {
                event.preventDefault()
                options.onAccept()
                return true
              }

              if (event.key === 'Escape') {
                event.preventDefault()
                options.onDismiss()
                return true
              }

              if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete', 'Enter'].includes(
                  event.key,
                )
              ) {
                options.onDismiss()
                return false
              }

              if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
                options.onDismiss()
              }

              return false
            },
          },
        }),
      ]
    },
  })
}

export function refreshPredictionDecorations(editor: Editor | null) {
  if (!editor?.view) return
  editor.view.dispatch(editor.state.tr.setMeta(predictionPluginKey, 'refresh'))
}

'use client'

import type { Editor, JSONContent } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { TextSelection } from '@tiptap/pm/state'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useRef } from 'react'

import { InkwiseCitationAnchorEditorNode } from '@/components/inkwise/editor-citation-anchor'
import { InkwiseNoteRefEditorNode } from '@/components/inkwise/editor-note-ref'
import { createPredictionExtension, refreshPredictionDecorations } from '@/components/inkwise/editor-prediction'
import { createWritingSelectionHighlightExtension } from '@/components/inkwise/editor-writing-selection'
import { InkwiseEditorToolbar } from '@/components/inkwise/editor-toolbar'
import {
  createTrackChangesExtension,
  getInkwiseComments,
  getInkwiseTrackedChanges,
  type InkwiseEditorCommentThread,
  type InkwiseTrackedChange,
} from '@/lib/inkwise-editor-extensions'
import { INKWISE_TIPTAP_BASE_EXTENSIONS } from '@/lib/inkwise-tiptap'
import { cn } from '@/lib/utils'

export type InkwiseEditorValue = {
  json: JSONContent
  html: string
  text: string
}

export type InkwiseEditorReviewState = {
  comments: InkwiseEditorCommentThread[]
  changes: InkwiseTrackedChange[]
}

export function InkwiseEditor({
  contentJson,
  contentHtml,
  placeholder,
  onChange,
  onEditor,
  predictionText,
  predictionLoading,
  onAcceptPrediction,
  onDismissPrediction,
  onUserTyping,
  onBlur,
  editable = true,
  allowExternalSetContent = true,
  trackChangesEnabled = false,
  onTrackChangesEnabledChange,
  onReviewDataChange,
  className,
  focusMode = false,
}: {
  contentJson: JSONContent | null | undefined
  contentHtml: string | null | undefined
  placeholder?: string
  onChange: (value: InkwiseEditorValue) => void
  onEditor?: (editor: Editor | null) => void
  predictionText?: string
  predictionLoading?: boolean
  onAcceptPrediction?: () => void
  onDismissPrediction?: () => void
  onUserTyping?: () => void
  onBlur?: () => void
  editable?: boolean
  allowExternalSetContent?: boolean
  trackChangesEnabled?: boolean
  onTrackChangesEnabledChange?: (enabled: boolean) => void
  onReviewDataChange?: (value: InkwiseEditorReviewState) => void
  className?: string
  focusMode?: boolean
}) {
  const incoming = useMemo(() => {
    if (contentJson) return contentJson
    if (contentHtml) return contentHtml
    return ''
  }, [contentJson, contentHtml])

  const lastExternalSetRef = useRef<string | null>(null)
  const predictionTextRef = useRef(predictionText || '')
  predictionTextRef.current = predictionText || ''
  const predictionLoadingRef = useRef(Boolean(predictionLoading))
  predictionLoadingRef.current = Boolean(predictionLoading)

  const acceptPredictionRef = useRef(onAcceptPrediction)
  acceptPredictionRef.current = onAcceptPrediction

  const dismissPredictionRef = useRef(onDismissPrediction)
  dismissPredictionRef.current = onDismissPrediction

  const onUserTypingRef = useRef(onUserTyping)
  onUserTypingRef.current = onUserTyping

  const onBlurRef = useRef(onBlur)
  onBlurRef.current = onBlur
  const trackChangesEnabledRef = useRef(Boolean(trackChangesEnabled))
  trackChangesEnabledRef.current = Boolean(trackChangesEnabled)

  const onReviewDataChangeRef = useRef(onReviewDataChange)
  onReviewDataChangeRef.current = onReviewDataChange

  const predictionExtension = useMemo(
    () =>
      createPredictionExtension({
        getSuggestion: () => predictionTextRef.current,
        getLoading: () => predictionLoadingRef.current,
        onAccept: () => acceptPredictionRef.current?.(),
        onDismiss: () => dismissPredictionRef.current?.(),
      }),
    [],
  )
  const writingSelectionHighlightExtension = useMemo(() => createWritingSelectionHighlightExtension(), [])
  const trackChangesExtension = useMemo(() => createTrackChangesExtension(() => trackChangesEnabledRef.current), [])

  const editor = useEditor({
    extensions: [
      ...INKWISE_TIPTAP_BASE_EXTENSIONS,
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
      InkwiseCitationAnchorEditorNode,
      InkwiseNoteRefEditorNode,
      predictionExtension,
      writingSelectionHighlightExtension,
      trackChangesExtension,
    ],
    content: incoming,
    editable,
    editorProps: {
      attributes: {
        class:
          focusMode
            ? 'prose prose-slate max-w-none min-h-full px-5 py-5 focus:outline-none text-slate-900 prose-headings:font-semibold prose-p:leading-7 sm:px-6 sm:py-6'
            : 'prose prose-slate max-w-none min-h-full px-4 py-4 focus:outline-none text-slate-900 prose-headings:font-semibold prose-p:leading-7',
      },
      handleTextInput() {
        onUserTypingRef.current?.()
        return false
      },
    },
    onUpdate: ({ editor }) => {
      onChange({
        json: editor.getJSON(),
        html: editor.getHTML(),
        text: editor.getText(),
      })
    },
    onBlur: () => {
      onBlurRef.current?.()
    },
  })

  useEffect(() => {
    onEditor?.(editor)
    return () => onEditor?.(null)
  }, [editor, onEditor])

  useEffect(() => {
    if (!editor || !allowExternalSetContent) return

    const signature = contentJson ? JSON.stringify(contentJson) : contentHtml || ''
    if (lastExternalSetRef.current === signature) return

    const currentSig = JSON.stringify(editor.getJSON())
    if (contentJson && currentSig === JSON.stringify(contentJson)) {
      lastExternalSetRef.current = signature
      return
    }
    if (!contentJson && typeof contentHtml === 'string' && editor.getHTML() === contentHtml) {
      lastExternalSetRef.current = signature
      return
    }

    // setContent replaces the whole doc, which collapses the selection to the
    // document start; restore it so caret-anchored UI (inline writing tools,
    // bubble/floating menus) doesn't jump when a save round-trip syncs
    // equivalent content back in.
    const { from, to } = editor.state.selection
    editor.commands.setContent(incoming, false)
    const { doc } = editor.state
    const selection = TextSelection.between(
      doc.resolve(Math.min(from, doc.content.size)),
      doc.resolve(Math.min(to, doc.content.size)),
    )
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    lastExternalSetRef.current = signature
  }, [editor, incoming, contentJson, contentHtml, allowExternalSetContent])

  useEffect(() => {
    refreshPredictionDecorations(editor)
  }, [editor, predictionText, predictionLoading])

  useEffect(() => {
    if (!editor) return

    const syncReviewData = () => {
      onReviewDataChangeRef.current?.({
        comments: getInkwiseComments(editor),
        changes: getInkwiseTrackedChanges(editor),
      })
    }

    syncReviewData()
    editor.on('update', syncReviewData)
    editor.on('selectionUpdate', syncReviewData)
    return () => {
      editor.off('update', syncReviewData)
      editor.off('selectionUpdate', syncReviewData)
    }
  }, [editor])

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-2xl border',
          focusMode ? 'border-white/40 bg-white/80 shadow-2xl shadow-slate-950/20 backdrop-blur-xl' : 'bg-white',
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border',
        focusMode ? 'border-white/40 bg-white/80 shadow-2xl shadow-slate-950/20 backdrop-blur-xl' : 'bg-white shadow-sm',
        className
      )}
    >
      {editable ? (
        <InkwiseEditorToolbar
          editor={editor}
          trackChangesEnabled={trackChangesEnabled}
          onTrackChangesEnabledChange={onTrackChangesEnabledChange}
          focusMode={focusMode}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  )
}

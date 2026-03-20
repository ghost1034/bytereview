'use client'

import type { Editor, JSONContent } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useMemo, useRef } from 'react'

import { createPredictionExtension, refreshPredictionDecorations } from '@/components/inkwise/editor-prediction'
import { InkwiseEditorToolbar } from '@/components/inkwise/editor-toolbar'

export type InkwiseEditorValue = {
  json: JSONContent
  html: string
  text: string
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
  onBlur,
  editable = true,
  allowExternalSetContent = true,
  className,
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
  onBlur?: () => void
  editable?: boolean
  allowExternalSetContent?: boolean
  className?: string
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

  const onBlurRef = useRef(onBlur)
  onBlurRef.current = onBlur

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
      predictionExtension,
    ],
    content: incoming,
    editable,
    editorProps: {
      attributes: {
        class:
          'prose prose-slate max-w-none min-h-[320px] px-4 py-4 focus:outline-none prose-headings:font-semibold prose-p:leading-7',
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

    editor.commands.setContent(incoming, false)
    lastExternalSetRef.current = signature
  }, [editor, incoming, contentJson, contentHtml, allowExternalSetContent])

  useEffect(() => {
    refreshPredictionDecorations(editor)
  }, [editor, predictionText, predictionLoading])

  if (!editor) {
    return <div className={`min-h-[320px] rounded-2xl border bg-white ${className || ''}`} />
  }

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${className || ''}`}>
      {editable ? <InkwiseEditorToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  )
}

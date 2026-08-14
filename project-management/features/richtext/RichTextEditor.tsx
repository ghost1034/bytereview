'use client'

/**
 * RichTextEditor — contentEditable editor with toolbar and sanitized HTML output.
 */
import { useCallback, useEffect, useRef } from 'react'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import { EditorToolbar } from './EditorToolbar'
import { applyRichTextCommand, handleRichTextShortcut } from './richTextCommands'

export type RichTextEditorProps = {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  minHeightClassName?: string
  showToolbar?: boolean
  disabled?: boolean
  ariaLabel?: string
}

/** Controlled rich-text surface emitting sanitized HTML. */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something…',
  className,
  minHeightClassName = 'min-h-32',
  showToolbar = true,
  disabled,
  ariaLabel = 'Rich text editor',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  useEffect(() => {
    const el = editorRef.current
    if (!el || syncing.current) return
    const next = value || ''
    if (el.innerHTML !== next) el.innerHTML = next
  }, [value])

  const emitChange = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    syncing.current = true
    const sanitized = sanitizeHtml(el.innerHTML)
    if (sanitized !== el.innerHTML) el.innerHTML = sanitized
    onChange(sanitized)
    syncing.current = false
  }, [onChange])

  const runCommand = useCallback(
    (command: Parameters<typeof applyRichTextCommand>[0], cmdValue?: string) => {
      applyRichTextCommand(command, cmdValue)
      editorRef.current?.focus()
      emitChange()
    },
    [emitChange],
  )

  return (
    <div className={className}>
      {showToolbar ? <EditorToolbar onCommand={runCommand} /> : null}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        className={`${minHeightClassName} rounded-b-lg border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background tl-rich-editor empty:before:text-[hsl(var(--foreground-subtle))] empty:before:content-[attr(data-placeholder)]`}
        style={{
          borderColor: 'hsl(var(--border))',
          background: 'hsl(var(--card))',
          color: 'hsl(var(--foreground-muted))',
          opacity: disabled ? 0.6 : 1,
        }}
        onInput={emitChange}
        onBlur={emitChange}
        onKeyDown={(event) => {
          if (handleRichTextShortcut(event)) emitChange()
        }}
      />
    </div>
  )
}

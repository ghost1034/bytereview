'use client'

import { useCallback, useEffect, useRef } from 'react'
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  html: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
}

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value)
}

function ensureEditorHasBlock(el: HTMLDivElement) {
  const text = el.textContent?.replace(/\u200b/g, '').trim() ?? ''
  if (!text && !el.querySelector('ul,ol,blockquote,pre,h2,h3,p,div')) {
    el.innerHTML = '<div><br></div>'
  }
}

/** Compact contentEditable block for status sections and message bodies. */
export function RichTextBlock({ html, onChange, placeholder, minHeight = 'min-h-20' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const selectionRef = useRef<Range | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || syncing.current) return
    const next = html || ''
    if (el.innerHTML !== next) el.innerHTML = next
  }, [html])

  const cacheSelection = useCallback(() => {
    const el = ref.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (el.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange()
    }
  }, [])

  const restoreSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || !selectionRef.current) return
    sel.removeAllRanges()
    sel.addRange(selectionRef.current)
  }, [])

  const sync = useCallback(() => {
    const el = ref.current
    if (!el) return
    syncing.current = true
    onChange(el.innerHTML)
    syncing.current = false
    cacheSelection()
  }, [cacheSelection, onChange])

  const runCommand = (command: string, value?: string) => {
    const el = ref.current
    if (!el) return
    el.focus()
    ensureEditorHasBlock(el)
    restoreSelection()
    exec(command, value)
    cacheSelection()
    sync()
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-0.5">
        {[
          { icon: Bold, cmd: 'bold' },
          { icon: Italic, cmd: 'italic' },
          { icon: Underline, cmd: 'underline' },
        ].map(({ icon: Icon, cmd }) => (
          <Button
            key={cmd}
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onMouseDown={(e) => {
              e.preventDefault()
              runCommand(cmd)
            }}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onMouseDown={(e) => {
            e.preventDefault()
            runCommand('insertUnorderedList')
          }}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onMouseDown={(e) => {
            e.preventDefault()
            runCommand('insertOrderedList')
          }}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        className={`tl-rich-editor rounded-lg border p-2 text-sm outline-none tl-input empty:before:text-[var(--ink-faint)] empty:before:content-[attr(data-placeholder)] ${minHeight}`}
        style={{ color: 'var(--ink-primary)' }}
        data-placeholder={placeholder}
        onBlur={sync}
        onInput={sync}
        onKeyUp={cacheSelection}
        onMouseUp={cacheSelection}
        onFocus={() => {
          if (ref.current) ensureEditorHasBlock(ref.current)
          cacheSelection()
        }}
      />
    </div>
  )
}

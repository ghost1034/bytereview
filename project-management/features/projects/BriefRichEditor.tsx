'use client'

import { useCallback, useRef } from 'react'
import { Bold, Italic, Link2, List, ListOrdered, Underline } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = {
  html: string
  onChange: (html: string) => void
  placeholder?: string
  ariaLabel?: string
}

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value)
}

/** Lightweight contentEditable brief editor for project overview. */
export function BriefRichEditor({ html, onChange, placeholder, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const sync = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML)
  }, [onChange])

  const addLink = () => {
    const url = window.prompt('URL')
    if (url) exec('createLink', url)
    sync()
  }

  const addImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        exec('insertImage', String(reader.result))
        sync()
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {[
          { icon: Bold, cmd: 'bold' },
          { icon: Italic, cmd: 'italic' },
          { icon: Underline, cmd: 'underline' },
        ].map(({ icon: Icon, cmd }) => (
          <Button key={cmd} type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onMouseDown={(e) => { e.preventDefault(); exec(cmd); sync() }}>
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'h2'); sync() }}>H2</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'h3'); sync() }}>H3</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); sync() }}>
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); sync() }}>
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onMouseDown={(e) => { e.preventDefault(); addLink() }}>
          <Link2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'pre'); sync() }}>Code</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-xs" onMouseDown={(e) => { e.preventDefault(); addImage() }}>Image</Button>
      </div>
      <div
        ref={ref}
        contentEditable
        aria-label={ariaLabel}
        suppressContentEditableWarning
        className="min-h-28 rounded-lg border p-3 text-sm outline-none tl-input"
        style={{ color: 'var(--ink-primary)' }}
        data-placeholder={placeholder}
        dangerouslySetInnerHTML={{ __html: html || '' }}
        onBlur={sync}
        onInput={sync}
      />
    </div>
  )
}

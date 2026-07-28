'use client'

/** Formatting toolbar for the comment composer. */
import { Bold, Italic, Link as LinkIcon, List, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Props = { onExec: (cmd: string, value?: string) => void }

/** Bold/italic/link/list controls for contentEditable composer. */
export function ComposerToolbar({ onExec }: Props) {
  return (
    <div
      className="flex flex-wrap gap-0.5 rounded-t-lg border border-b-0 p-1"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-muted)' }}
    >
      {[
        { icon: Bold, cmd: 'bold', label: 'Bold' },
        { icon: Italic, cmd: 'italic', label: 'Italic' },
        { icon: List, cmd: 'insertUnorderedList', label: 'Bullets' },
        { icon: ListOrdered, cmd: 'insertOrderedList', label: 'Numbered' },
      ].map(({ icon: Icon, cmd, label }) => (
        <Button key={label} type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={label} onClick={() => onExec(cmd)}>
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        aria-label="Link"
        onClick={() => {
          const url = window.prompt('URL')
          if (url) onExec('createLink', url)
        }}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

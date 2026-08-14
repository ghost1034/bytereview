'use client'

/**
 * Persistent formatting toolbar for RichTextEditor.
 */
import {
  Bold,
  Code,
  Eraser,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { applyRichTextCommand, type RichTextCommand } from './richTextCommands'

type Props = {
  onCommand: (command: RichTextCommand, value?: string) => void
  className?: string
}

const BUTTONS: { command: RichTextCommand; icon: typeof Bold; label: string }[] = [
  { command: 'bold', icon: Bold, label: 'Bold' },
  { command: 'italic', icon: Italic, label: 'Italic' },
  { command: 'underline', icon: Underline, label: 'Underline' },
  { command: 'strikeThrough', icon: Strikethrough, label: 'Strikethrough' },
  { command: 'h1', icon: Heading1, label: 'Heading 1' },
  { command: 'h2', icon: Heading2, label: 'Heading 2' },
  { command: 'h3', icon: Heading3, label: 'Heading 3' },
  { command: 'bulletList', icon: List, label: 'Bullet list' },
  { command: 'numberedList', icon: ListOrdered, label: 'Numbered list' },
  { command: 'blockquote', icon: Quote, label: 'Block quote' },
  { command: 'code', icon: Code, label: 'Code block' },
  { command: 'clear', icon: Eraser, label: 'Clear formatting' },
]

/** Toolbar row shared by rich-text surfaces. */
export function EditorToolbar({ onCommand, className }: Props) {
  const [linkUrl, setLinkUrl] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)

  const run = (command: RichTextCommand, value?: string) => {
    onCommand(command, value)
  }

  return (
    <div
      className={`mb-1 flex flex-wrap gap-0.5 rounded-t-lg border border-b-0 p-1 ${className ?? ''}`}
      style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-muted))' }}
    >
      {BUTTONS.map(({ command, icon: Icon, label }) => (
        <Button
          key={label}
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run(command)}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
      <Popover open={linkOpen} onOpenChange={setLinkOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Insert link"
            onMouseDown={(e) => e.preventDefault()}
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="flex gap-2">
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              className="rounded-md border border-input bg-background text-foreground h-8 text-sm"
            />
            <Button
              size="sm"
              className=" h-8 border-0"
              disabled={!linkUrl.trim()}
              onClick={() => {
                run('link', linkUrl.trim())
                setLinkUrl('')
                setLinkOpen(false)
              }}
            >
              Add
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { applyRichTextCommand }

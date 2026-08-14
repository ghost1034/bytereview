'use client'

/** Keyboard shortcuts reference dialog (? or Help menu). */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Shortcut = { keys: string; description: string }

const SHORTCUTS: Shortcut[] = [
  { keys: '⌘K', description: 'Open command palette' },
  { keys: 'c', description: 'Quick-create task' },
  { keys: 'g h', description: 'Go to Home' },
  { keys: 'g m', description: 'Go to My Tasks' },
  { keys: 'g i', description: 'Go to Inbox' },
  { keys: '[', description: 'Collapse sidebar' },
  { keys: ']', description: 'Expand sidebar' },
  { keys: 'Shift+T', description: 'Open timer controls' },
  { keys: '?', description: 'Show this dialog' },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="grid gap-2 py-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.keys}
              className="flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm"
              style={{ background: 'hsl(var(--surface-muted))' }}
            >
              <span style={{ color: 'hsl(var(--foreground-muted))' }}>{s.description}</span>
              <kbd
                className="rounded-md border px-2 py-0.5 font-mono text-xs font-medium tabular-nums"
                style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
              >
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

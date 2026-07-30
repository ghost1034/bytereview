'use client'

/** Rule run history modal — last 50 runs with task link and errors. */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatRelative } from '../../lib/time'
import { getRuleHistory } from '../../lib/rulesEngine'
import type { Rule } from '../../types'

type Props = {
  rule: Rule | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RuleHistoryModal({ rule, open, onOpenChange }: Props) {
  if (!rule) return null
  const entries = getRuleHistory(rule.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">History — {rule.name}</DialogTitle>
        </DialogHeader>
        {entries.length === 0 ? (
          <p className="py-4 text-sm" style={{ color: 'var(--ink-muted)' }}>No runs recorded yet.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {entries.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{e.taskName}</span>
                  <span className="shrink-0 text-xs" style={{ color: 'var(--ink-muted)' }}>
                    {formatRelative(e.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
                  {e.actionsApplied.join(', ') || 'No actions'}
                </p>
                {e.error ? (
                  <p className="mt-1 text-xs text-destructive">{e.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

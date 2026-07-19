'use client'

import * as React from 'react'
import { Check, ChevronLeft, Cloud, CloudOff, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type ComposerSaveState = 'idle' | 'saving' | 'saved' | 'error'

export function ComposerShell({
  title,
  onTitleChange,
  stage,
  saveState = 'idle',
  onClose,
  onBack,
  primary,
  children,
}: {
  title: string
  onTitleChange?: (title: string) => void
  stage: 'prepare' | 'fields'
  saveState?: ComposerSaveState
  onClose: () => void
  onBack?: () => void
  primary: React.ReactNode
  children: React.ReactNode
}) {
  const status = {
    idle: { icon: Cloud, label: 'Ready' },
    saving: { icon: Loader2, label: 'Saving…' },
    saved: { icon: Check, label: 'Saved' },
    error: { icon: CloudOff, label: 'Save failed · retry' },
  }[saveState]
  const StatusIcon = status.icon

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--esign-workspace)] text-foreground"
      style={{ '--esign-workspace': 'hsl(var(--surface-muted))', '--esign-chrome': 'hsl(var(--surface))' } as React.CSSProperties}
    >
      <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-[var(--esign-chrome)] px-3 shadow-sm sm:px-5">
        <Button variant="ghost" size="icon" onClick={onBack ?? onClose} aria-label={onBack ? 'Back to prepare' : 'Close composer'}>
          {onBack ? <ChevronLeft className="size-5" /> : <X className="size-5" />}
        </Button>
        <div className="min-w-0 flex-1">
          {onTitleChange ? (
            <Input value={title} onChange={(event) => onTitleChange(event.target.value)} aria-label="Envelope title" className="h-8 max-w-xl border-transparent bg-transparent px-1 text-sm font-semibold shadow-none hover:border-input focus-visible:border-input" maxLength={255} />
          ) : <p className="truncate text-sm font-semibold">{title}</p>}
          <div className="flex items-center gap-2 px-1 text-[11px] text-foreground-subtle">
            <span>CPAAutomation E‑Signature</span><span aria-hidden>·</span>
            <span className={cn('inline-flex items-center gap-1', saveState === 'error' && 'text-destructive')} role="status" aria-live="polite">
              <StatusIcon className={cn('size-3', saveState === 'saving' && 'animate-spin')} /> {status.label}
            </span>
          </div>
        </div>
        <ol className="hidden items-center gap-2 text-xs sm:flex" aria-label="Envelope stages">
          <li className={cn('rounded-full px-3 py-1.5 font-medium', stage === 'prepare' ? 'bg-primary text-primary-foreground' : 'bg-primary-soft text-primary')}>1 Prepare</li>
          <li className={cn('rounded-full px-3 py-1.5 font-medium', stage === 'fields' ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-foreground-muted')}>2 Add fields & send</li>
        </ol>
        <div className="ml-1">{primary}</div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}

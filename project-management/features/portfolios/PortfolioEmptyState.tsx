'use client'

/** Editorial empty state for portfolios surfaces. */
import { FolderKanban } from 'lucide-react'

type Props = { title?: string; hint?: string }

export function PortfolioEmptyState({
  title = 'No portfolios yet',
  hint = 'Group projects into portfolios to track health across initiatives.',
}: Props) {
  return (
    <div className="tl-card flex flex-col items-center p-10 text-center shadow-paper-sm">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'var(--primary-soft)' }}
      >
        <FolderKanban className="h-7 w-7" style={{ color: 'var(--primary)' }} />
      </div>
      <h3 className="font-serif text-lg">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        {hint}
      </p>
    </div>
  )
}

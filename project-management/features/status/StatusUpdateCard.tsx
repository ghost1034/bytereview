'use client'

import { format } from 'date-fns'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import { formatRelative } from '../../lib/time'
import type { StatusUpdate, User } from '../../types'
import { ProjectStatusPill } from '../projects/ProjectStatusPill'

type Props = {
  update: StatusUpdate
  author?: User
  compact?: boolean
}

function Section({ title, html }: { title: string; html?: string }) {
  if (!html?.trim()) return null
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
        {title}
      </p>
      <div
        className="text-sm leading-relaxed"
        style={{ color: 'hsl(var(--foreground-muted))' }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
      />
    </div>
  )
}

/** Renders one status update with status pill, author, and rich sections. */
export function StatusUpdateCard({ update, author, compact }: Props) {
  return (
    <article className="rounded-lg p-3" style={{ background: 'hsl(var(--surface-muted))' }}>
      <div className="flex flex-wrap items-center gap-2">
        <ProjectStatusPill status={update.status} />
        <span className="text-sm font-medium">{update.title}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
        <span>{author?.name ?? 'Unknown'}</span>
        <span>·</span>
        <span title={format(new Date(update.createdAt), 'PPpp')}>{formatRelative(update.createdAt)}</span>
      </div>
      {!compact ? (
        <>
          <div
            className="mt-3 text-sm leading-relaxed"
            style={{ color: 'hsl(var(--foreground-muted))' }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(update.summaryHtml) }}
          />
          <Section title="Highlights" html={update.highlightsHtml} />
          <Section title="Blockers" html={update.blockersHtml} />
          <Section title="Next steps" html={update.nextStepsHtml} />
        </>
      ) : null}
    </article>
  )
}

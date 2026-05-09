import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Briefcase } from 'lucide-react'

import { cn } from '@/lib/utils'
import { JobStatusBadge, type JobStatus } from './job-status-badge'

interface JobRowProps {
  id: string
  name: string
  status: JobStatus
  createdAt: string | Date
  href?: string
  meta?: React.ReactNode
  className?: string
}

function formatDate(value: string | Date) {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function JobRow({
  id,
  name,
  status,
  createdAt,
  href,
  meta,
  className,
}: JobRowProps) {
  const target = href ?? `/dashboard/jobs/${id}`

  return (
    <Link
      href={target}
      aria-label={`Open job ${name}`}
      className={cn(
        'group flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3 transition-colors',
        'hover:border-border-strong hover:bg-surface',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground"
        aria-hidden
      >
        <Briefcase className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="truncate text-xs text-foreground-subtle">
          {meta ?? formatDate(createdAt)}
        </p>
      </div>
      <JobStatusBadge status={status} className="hidden sm:inline-flex" />
      <ArrowRight
        className="size-4 shrink-0 text-foreground-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground-muted"
        aria-hidden
      />
    </Link>
  )
}

import * as React from 'react'

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

type Variant = 'list' | 'table' | 'card-grid' | 'page'

interface LoadingStateProps {
  variant?: Variant
  rows?: number
  columns?: number
  className?: string
  /** Optional caption read by screen readers */
  label?: string
}

export function LoadingState({
  variant = 'list',
  rows = 4,
  columns = 4,
  className,
  label = 'Loading…',
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('animate-fade-in', className)}
    >
      <span className="sr-only">{label}</span>
      {variant === 'list' && (
        <ul className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-4 py-3"
            >
              <Skeleton className="size-9 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </li>
          ))}
        </ul>
      )}

      {variant === 'card-grid' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-lg border border-border bg-surface-raised p-5"
            >
              <Skeleton className="size-10 rounded-md" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {variant === 'table' && (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid border-b border-border bg-surface-muted px-4 py-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-20" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="grid border-b border-border px-4 py-4 last:border-b-0"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns }).map((_, c) => (
                <Skeleton key={c} className="h-3.5 w-2/3" />
              ))}
            </div>
          ))}
        </div>
      )}

      {variant === 'page' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}

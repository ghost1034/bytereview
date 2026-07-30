'use client'

/**
 * Warm shimmer skeleton presets for list, board, detail, and chart loading.
 */
import { Skeleton } from '@/components/ui/skeleton'

/** Single list row skeleton. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
      <Skeleton className="tl-shimmer h-4 w-4 rounded" />
      <Skeleton className="tl-shimmer h-4 flex-1 max-w-[240px]" />
      <Skeleton className="tl-shimmer h-6 w-6 rounded-full" />
      <Skeleton className="tl-shimmer h-5 w-16 rounded-full" />
    </div>
  )
}

/** Board card skeleton. */
export function SkeletonCard() {
  return (
    <div className="tl-card space-y-2 p-3 shadow-paper-sm">
      <Skeleton className="tl-shimmer h-3 w-3/4" />
      <Skeleton className="tl-shimmer h-3 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="tl-shimmer h-5 w-5 rounded-full" />
        <Skeleton className="tl-shimmer h-5 w-12 rounded-full" />
      </div>
    </div>
  )
}

/** Chart placeholder skeleton. */
export function SkeletonChart({ variant = 'bar' }: { variant?: 'bar' | 'line' | 'donut' }) {
  if (variant === 'donut') {
    return <Skeleton className="tl-shimmer mx-auto h-32 w-32 rounded-full" />
  }
  return (
    <div className="flex h-32 items-end gap-2 px-4">
      {[40, 65, 45, 80, 55, 70].map((h, i) => (
        <Skeleton key={i} className="tl-shimmer flex-1 rounded-t-md" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

/** Sidebar nav row skeleton. */
export function SkeletonSidebarRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1 p-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="tl-shimmer h-9 w-full rounded-lg" />
      ))}
    </div>
  )
}

/** List view loading — 8 rows. */
export function ListViewSkeleton() {
  return (
    <div className="tl-card overflow-hidden shadow-paper-sm">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}

/** Board view loading — 3 columns × 3 cards. */
export function BoardViewSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
      {Array.from({ length: 3 }).map((_, col) => (
        <div key={col} className="w-[min(280px,85vw)] shrink-0 snap-start space-y-2">
          <Skeleton className="tl-shimmer h-5 w-24 rounded" />
          {Array.from({ length: 3 }).map((__, row) => (
            <SkeletonCard key={row} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Task detail pane loading skeleton. */
export function TaskDetailSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="tl-shimmer h-8 w-3/4 rounded" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="tl-shimmer h-3 w-20 rounded" />
          <Skeleton className="tl-shimmer h-8 flex-1 rounded-md" />
        </div>
      ))}
      <Skeleton className="tl-shimmer h-32 w-full rounded-lg" />
    </div>
  )
}

/** Calendar grid skeleton with shimmer. */
export function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 35 }).map((_, i) => (
        <Skeleton key={i} className="tl-shimmer aspect-square rounded-md" />
      ))}
    </div>
  )
}

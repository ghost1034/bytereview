'use client'

import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

type InkwiseSourceListLoadMoreProps = {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  loadedCount?: number
  totalCount?: number
}

/**
 * Sentinel row rendered at the bottom of a paginated reference list. Requests
 * the next page when it scrolls into view, with a button fallback for
 * environments without IntersectionObserver.
 */
export function InkwiseSourceListLoadMore({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  loadedCount,
  totalCount,
}: InkwiseSourceListLoadMoreProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = sentinelRef.current
    if (!element || !hasNextPage || isFetchingNextPage) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, onLoadMore])

  if (!hasNextPage && !isFetchingNextPage) return null

  const progress =
    typeof loadedCount === 'number' && typeof totalCount === 'number' && totalCount > 0
      ? ` (${loadedCount} of ${totalCount})`
      : ''

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-2">
      {isFetchingNextPage ? (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading more references…{progress}
        </div>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          Load more references{progress}
        </button>
      )}
    </div>
  )
}

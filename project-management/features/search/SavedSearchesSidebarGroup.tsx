'use client'

import Link from 'next/link'
import { Search } from 'lucide-react'
import type { SavedView, Task } from '../../types'
import { applyViewQuery, DEFAULT_VIEW_QUERY } from '../../lib/query'

export function savedSearchLiveCount(saved: SavedView, tasks: Task[], currentUserId?: string | null): number {
  const query = saved.query ?? { ...DEFAULT_VIEW_QUERY, filters: saved.filters as typeof DEFAULT_VIEW_QUERY.filters, filterExpression: saved.filterExpression }
  return applyViewQuery(tasks, query, { projectId: '', currentUserId, forceShowCompleted: true }).length
}

export function SavedSearchesSidebarGroup({ basePath, searches, tasks, currentUserId, collapsed, onNavigate }: { basePath: string; searches: SavedView[]; tasks: Task[]; currentUserId?: string | null; collapsed: boolean; onNavigate?: () => void }) {
  if (!searches.length) return null
  return <div className="space-y-0.5" aria-label="My searches">
    {!collapsed ? <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>My searches</p> : null}
    {searches.map((saved) => <Link key={saved.id} href={`${basePath}/my-searches?saved=${saved.id}`} onClick={onNavigate} className="flex h-8 items-center gap-2 rounded-lg px-2 text-sm hover:opacity-90" aria-label={`${saved.name} (${savedSearchLiveCount(saved, tasks, currentUserId)})`}>
      <Search className="h-4 w-4 shrink-0" />
      {!collapsed ? <><span className="min-w-0 flex-1 truncate">{saved.name}</span><span className="rounded-full px-1.5 text-xs" style={{ background: 'hsl(var(--surface-muted))' }}>{savedSearchLiveCount(saved, tasks, currentUserId)}</span></> : null}
    </Link>)}
  </div>
}

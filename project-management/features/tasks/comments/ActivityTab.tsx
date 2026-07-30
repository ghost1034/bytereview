'use client'

/**
 * ActivityTab — filtered, grouped activity timeline for a task.
 */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { filterTaskActivity, type ActivityFilter } from '../../../lib/activity'
import { formatRelative } from '../../../lib/time'
import { useActivityStore, useUsersStore } from '../../../stores/entities'
import type { Task } from '../../../types'
import {
  activityDayKey,
  formatActivityDayLabel,
  getActivityActor,
  renderActivitySentence,
} from './activityTypeRenderer'

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'updates', label: 'Updates' },
  { id: 'comments', label: 'Comments' },
  { id: 'subtasks', label: 'Subtasks' },
  { id: 'custom_fields', label: 'Custom fields' },
  { id: 'approvals', label: 'Approvals' },
]

type Props = { task: Task }

/** Activity tab content inside task detail. */
export function ActivityTab({ task }: Props) {
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [limit, setLimit] = useState(100)
  const users = useUsersStore((s) => s.list())

  const userById = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u]))
    return map
  }, [users])

  const allEvents = useActivityStore((s) =>
    s
      .list()
      .filter((a) => a.taskId === task.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )

  const events = useMemo(() => filterTaskActivity(allEvents, filter).slice(0, limit), [allEvents, filter, limit])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof events>()
    events.forEach((e) => {
      const key = activityDayKey(e.createdAt)
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    })
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [events])

  const total = filterTaskActivity(allEvents, filter).length

  if (!events.length) {
    return (
      <div>
        <FilterBar filter={filter} onFilter={setFilter} />
        <p className="mt-4 text-sm" style={{ color: 'var(--ink-muted)' }}>
          No activity yet.
        </p>
      </div>
    )
  }

  return (
    <div>
      <FilterBar filter={filter} onFilter={setFilter} />
      <TooltipProvider delayDuration={200}>
        <div className="mt-4 space-y-4">
          {grouped.map(([day, rows]) => (
            <div key={day}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
                {formatActivityDayLabel(day)}
              </p>
              <ul className="space-y-2">
                {rows.map((event) => {
                  const actor = userById.get(event.actorId) ?? getActivityActor(event.actorId)
                  return (
                    <li key={event.id} className="flex items-start gap-2 text-sm">
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ background: actor?.avatarColor ?? 'var(--primary)' }}
                      >
                        {(actor?.name ?? '?').slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <p style={{ color: 'var(--ink-secondary)' }}>
                          <span className="font-medium">{actor?.name ?? 'Someone'}</span>{' '}
                          {renderActivitySentence(event)}
                        </p>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                              {formatRelative(event.createdAt)}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent className="tl-popover-surface">{new Date(event.createdAt).toLocaleString()}</TooltipContent>
                        </Tooltip>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </TooltipProvider>
      {total > limit ? (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setLimit((n) => n + 50)}>
          View older
        </Button>
      ) : null}
    </div>
  )
}

function FilterBar({
  filter,
  onFilter,
}: {
  filter: ActivityFilter
  onFilter: (f: ActivityFilter) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onFilter(f.id)}
          className="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
          style={{
            background: filter === f.id ? 'var(--accent-soft)' : 'var(--bg-muted)',
            color: filter === f.id ? 'var(--accent)' : 'var(--ink-muted)',
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

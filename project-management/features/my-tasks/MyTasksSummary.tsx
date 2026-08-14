'use client'

/**
 * MyTasksSummary — home card with Today / Upcoming / Overdue tabs (max 5 tasks each).
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isPast, isToday, parseISO, addDays, isBefore, startOfToday } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useTasksStore } from '../../stores/entities'
import { updateTask } from '../../lib/taskActions'
import { formatDate } from '../../lib/time'
import { filterMyTasks } from './myTasksUtils'

type TabId = 'today' | 'upcoming' | 'overdue'

type Props = { workspaceId: string }

const TABS: { id: TabId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
]

/** Compact My Tasks preview for the workspace home page. */
export function MyTasksSummary({ workspaceId }: Props) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [tab, setTab] = useState<TabId>('today')
  const allTasks = useTasksStore((s) => s.list())
  const projects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId))

  const mine = useMemo(() => {
    if (!currentUserId) return []
    return filterMyTasks(allTasks, projects, workspaceId, currentUserId, true).filter((t) => !t.completed)
  }, [allTasks, currentUserId, projects, workspaceId])

  const buckets = useMemo(() => {
    const now = startOfToday()
    const today: typeof mine = []
    const upcoming: typeof mine = []
    const overdue: typeof mine = []
    mine.forEach((t) => {
      if (!t.dueOn) return
      const due = parseISO(t.dueOn)
      if (isPast(due) && !isToday(due)) overdue.push(t)
      else if (isToday(due)) today.push(t)
      else if (isBefore(due, addDays(now, 7))) upcoming.push(t)
    })
    return { today, upcoming, overdue }
  }, [mine])

  const items = (buckets[tab] ?? []).slice(0, 5)
  const basePath = `/dashboard/project-management/w/${workspaceId}/my-tasks`

  const toggle = async (taskId: string, completed: boolean) => {
    if (!currentUserId) return
    await updateTask(taskId, { completed: !completed, completedById: currentUserId }, currentUserId)
  }

  return (
    <section className="tl-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-sans text-lg">My Tasks</h2>
        <Button variant="link" size="sm" asChild className="h-auto p-0 text-xs">
          <Link href={basePath}>View all</Link>
        </Button>
      </div>
      <div className="mb-3 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{
              background: tab === t.id ? 'hsl(var(--primary-soft))' : 'hsl(var(--surface-muted))',
              color: tab === t.id ? 'hsl(var(--primary))' : 'hsl(var(--foreground-muted))',
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label} ({buckets[t.id].length})
          </button>
        ))}
      </div>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={t.completed} onCheckedChange={() => void toggle(t.id, t.completed)} />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => router.push(`${basePath}?task=${t.id}`)}
              >
                {t.name}
              </button>
              {t.dueOn ? (
                <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
                  {formatDate(t.dueOn)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm italic" style={{ color: 'hsl(var(--foreground-muted))' }}>
          A quiet inbox. A good day to start something.
        </p>
      )}
    </section>
  )
}

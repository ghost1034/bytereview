'use client'

/**
 * DependenciesSection — blocked-by and blocking task links with search picker.
 */
import { useMemo, useState } from 'react'
import { ArrowRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '../../stores/auth'
import { useTasksStore } from '../../stores/entities'
import { enforceDependentScheduling } from '../../lib/dependencyScheduling'
import {
  addDependency,
  getBlockedBy,
  getBlocking,
  removeDependency,
} from '../../lib/dependencies'
import type { Task } from '../../types'

type Props = { task: Task }

type PickerMode = 'blocked-by' | 'blocking' | null

function TaskChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}
    >
      {label}
      <button type="button" onClick={onRemove} aria-label="Remove">
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

/** Task detail pane dependency manager. */
export function DependenciesSection({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const allTasks = useTasksStore((s) => s.list())
  const [picker, setPicker] = useState<PickerMode>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const blockedBy = useMemo(() => getBlockedBy(task, allTasks), [allTasks, task])
  const blocking = useMemo(() => getBlocking(task, allTasks), [allTasks, task])

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    const linked = new Set([task.id, ...task.dependencyIds, ...task.dependentIds])
    return allTasks
      .filter((t) => t.workspaceId === task.workspaceId && !linked.has(t.id))
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [allTasks, query, task])

  const pickTask = async (other: Task) => {
    if (!currentUserId) return
    setError(null)
    const result =
      picker === 'blocked-by'
        ? await addDependency(task.id, other.id, currentUserId)
        : picker === 'blocking'
          ? await addDependency(other.id, task.id, currentUserId)
          : { ok: false, error: 'No picker mode' }
    if (!result.ok) setError(result.error ?? 'Could not add dependency')
    else {
      const projectIds = new Set(task.projectIds)
      const projectTasks = allTasks.filter(
        (t) => t.projectIds.some((id) => projectIds.has(id)) && !t.parentId
      )
      await enforceDependentScheduling(projectTasks, currentUserId)
    }
    setPicker(null)
    setQuery('')
  }

  return (
    <section className="mt-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Dependencies
      </p>

      <div className="space-y-3 text-sm">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span style={{ color: 'hsl(var(--foreground-muted))' }}>Blocked by</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setPicker('blocked-by')}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {blockedBy.length ? (
              blockedBy.map((t) => (
                <TaskChip
                  key={t.id}
                  label={t.name}
                  onRemove={() => currentUserId && void removeDependency(task.id, t.id, currentUserId)}
                />
              ))
            ) : (
              <span className="text-xs" style={{ color: 'hsl(var(--foreground-subtle))' }}>No predecessors</span>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span style={{ color: 'hsl(var(--foreground-muted))' }}>Blocking</span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => setPicker('blocking')}>
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {blocking.length ? (
              blocking.map((t) => (
                <TaskChip
                  key={t.id}
                  label={t.name}
                  onRemove={() => currentUserId && void removeDependency(t.id, task.id, currentUserId)}
                />
              ))
            ) : (
              <span className="text-xs" style={{ color: 'hsl(var(--foreground-subtle))' }}>Not blocking other tasks</span>
            )}
          </div>
        </div>
      </div>

      {picker ? (
        <div
          className="mt-3 rounded-lg border p-3 shadow-sm"
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-medium" style={{ color: 'hsl(var(--foreground-muted))' }}>
            <ArrowRight className="h-3 w-3" />
            {picker === 'blocked-by' ? 'Search task to wait on' : 'Search task that waits on this'}
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="tl-input h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setPicker(null)
                setQuery('')
                setError(null)
              }
            }}
          />
          <ul className="mt-2 max-h-40 overflow-y-auto">
            {candidates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--surface-muted))]"
                  onClick={() => void pickTask(t)}
                >
                  {t.name}
                </button>
              </li>
            ))}
            {!candidates.length ? (
              <li className="px-2 py-1 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>No matching tasks</li>
            ) : null}
          </ul>
          {error ? (
            <p className="mt-2 text-xs" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>
          ) : null}
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setPicker(null); setError(null) }}>
            Cancel
          </Button>
        </div>
      ) : null}
    </section>
  )
}

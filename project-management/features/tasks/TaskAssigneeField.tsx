'use client'

/**
 * TaskAssigneeField — user picker with search, recents, and assign-to-me.
 */
import { useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { assign } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import { useTasksStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'
import { UserAvatar } from '../profile/UserAvatar'
import type { Task } from '../../types'

type Props = { task: Task }

export function TaskAssigneeField({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const workspace = useWorkspacesStore((s) => s.getById(task.workspaceId))
  const recentIds = useTasksStore((s) => {
    const counts = new Map<string, number>()
    s.list()
      .filter((t) => t.workspaceId === task.workspaceId && t.assigneeId)
      .forEach((t) => counts.set(t.assigneeId!, (counts.get(t.assigneeId!) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id)
  })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const memberIds = useMemo(
    () => new Set(workspace?.memberIds ?? users.map((u) => u.id)),
    [users, workspace?.memberIds]
  )
  const workspaceUsers = users.filter((u) => memberIds.has(u.id))
  const assignee = users.find((u) => u.id === task.assigneeId)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return workspaceUsers.filter(
      (u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [query, workspaceUsers])

  const recents = recentIds.map((id) => users.find((u) => u.id === id)).filter(Boolean)

  const pick = async (userId: string | undefined) => {
    if (!currentUserId) return
    await assign(task.id, userId, currentUserId)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span style={{ color: 'hsl(var(--foreground-muted))' }}>Assignee</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="flex items-center gap-2 font-medium">
            {assignee ? (
              <>
                <UserAvatar userId={assignee.id} size="sm" showPresence={false} />
                {assignee.name}
              </>
            ) : (
              <span style={{ color: 'hsl(var(--foreground-muted))' }}>Unassigned</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="end">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="rounded-md border border-input bg-background text-foreground h-8 text-sm"
            autoFocus
          />
          {currentUserId ? (
            <button
              type="button"
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--surface-muted))]"
              style={{ color: 'hsl(var(--primary))' }}
              onClick={() => void pick(currentUserId)}
            >
              Assign to me
            </button>
          ) : null}
          {!query && recents.length ? (
            <div className="mt-2">
              <p className="px-2 text-xs font-medium uppercase" style={{ color: 'hsl(var(--foreground-subtle))' }}>
                Recent
              </p>
              {recents.map((u) =>
                u ? (
                  <button
                    key={u.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[hsl(var(--surface-muted))]"
                    onClick={() => void pick(u.id)}
                  >
                    <UserAvatar userId={u.id} size="sm" showPresence={false} />
                    {u.name}
                  </button>
                ) : null
              )}
            </div>
          ) : null}
          <ul className="mt-2 max-h-40 overflow-y-auto">
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[hsl(var(--surface-muted))]"
                  onClick={() => void pick(u.id)}
                >
                  <UserAvatar userId={u.id} size="sm" showPresence={false} />
                  <span className="truncate">{u.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {task.assigneeId ? (
            <button
              type="button"
              className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--surface-muted))]"
              style={{ color: 'hsl(var(--foreground-muted))' }}
              onClick={() => void pick(undefined)}
            >
              Clear assignee
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

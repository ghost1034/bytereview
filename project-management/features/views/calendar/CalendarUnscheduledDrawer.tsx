'use client'

/** CalendarUnscheduledDrawer — tasks without due dates; drag to schedule. */
import { useMemo, useState } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Project, Task } from '../../../types'
import { useTagsStore, useTasksStore, useUsersStore } from '../../../stores/entities'

type Props = {
  project: Project
  basePath: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDragStart: (taskId: string, e: React.DragEvent) => void
  onOpenTask: (taskId: string) => void
}

export function CalendarUnscheduledDrawer({
  project,
  open,
  onOpenChange,
  onDragStart,
  onOpenTask,
}: Props) {
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list().filter((t) => t.workspaceId === project.workspaceId))

  const unscheduled = useTasksStore((s) =>
    s
      .list()
      .filter(
        (t) =>
          t.projectIds.includes(project.id) &&
          !t.completed &&
          !t.dueOn &&
          !t.parentId
      )
  )

  const filtered = useMemo(() => {
    let list = unscheduled
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q))
    if (assigneeFilter === 'unassigned') list = list.filter((t) => !t.assigneeId)
    else if (assigneeFilter !== 'all')
      list = list.filter((t) => t.assigneeId === assigneeFilter)
    if (tagFilter !== 'all') list = list.filter((t) => t.tagIds.includes(tagFilter))
    return list
  }, [assigneeFilter, search, tagFilter, unscheduled])

  const toggleButton = !open ? (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(true)}>
      <PanelRightOpen className="h-4 w-4" />
      Unscheduled ({unscheduled.length})
    </Button>
  ) : (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(false)}>
      <PanelRightClose className="h-4 w-4" />
      Hide unscheduled
    </Button>
  )

  return (
    <>
      {toggleButton}
      {open ? (
        <aside
          className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l shadow-paper-md print:hidden"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="border-b p-4" style={{ borderColor: 'var(--border-subtle)' }}>
            <h2 className="font-serif text-lg">Unscheduled</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
              Drag tasks onto the calendar to set a due date.
            </p>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="tl-input mt-3 h-8 w-full text-sm"
            />
            <div className="mt-2 flex gap-2">
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="tl-input h-8 flex-1 text-xs"
              >
                <option value="all">All assignees</option>
                <option value="unassigned">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="tl-input h-8 flex-1 text-xs"
              >
                <option value="all">All tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <li className="p-4 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
                {unscheduled.length === 0 ? 'All tasks have due dates.' : 'No matches.'}
              </li>
            ) : (
              filtered.map((task) => (
                <li key={task.id}>
                  <DrawerItem
                    task={task}
                    onDragStart={onDragStart}
                    onClick={() => onOpenTask(task.id)}
                  />
                </li>
              ))
            )}
          </ul>
        </aside>
      ) : null}
    </>
  )
}

function DrawerItem({
  task,
  onDragStart,
  onClick,
}: {
  task: Task
  onDragStart: (taskId: string, e: React.DragEvent) => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => onDragStart(task.id, e)}
      className="mb-2 w-full rounded-lg px-3 py-2 text-left text-sm"
      style={{ background: 'var(--bg-muted)' }}
      onClick={onClick}
    >
      {task.name}
    </button>
  )
}

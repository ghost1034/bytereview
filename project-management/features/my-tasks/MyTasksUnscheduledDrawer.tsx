'use client'

/**
 * MyTasksUnscheduledDrawer — undated assigned tasks for calendar view.
 */
import { useMemo, useState } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Task } from '../../types'

type Props = {
  tasks: Task[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDragStart: (taskId: string, e: React.DragEvent) => void
  onOpenTask: (id: string) => void
}

/** Side drawer listing the user's tasks without due dates. */
export function MyTasksUnscheduledDrawer({ tasks, open, onOpenChange, onDragStart, onOpenTask }: Props) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? tasks.filter((t) => t.name.toLowerCase().includes(q)) : tasks
  }, [search, tasks])

  const toggleButton = !open ? (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenChange(true)}>
      <PanelRightOpen className="h-4 w-4" />
      Unscheduled ({tasks.length})
    </Button>
  ) : null

  return (
    <>
      {toggleButton}
      {open ? (
        <aside
          className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l shadow-md"
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
        >
          <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: 'hsl(var(--border))' }}>
            <h3 className="font-sans text-sm">Unscheduled</h3>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tasks…"
            className="tl-input m-2 h-8 text-sm"
          />
          <ul className="flex-1 overflow-y-auto px-2 pb-4">
            {filtered.map((task) => (
              <li key={task.id} className="mb-1">
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => onDragStart(task.id, e)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--surface-muted))]"
                  onClick={() => onOpenTask(task.id)}
                >
                  {task.name}
                </button>
              </li>
            ))}
            {!filtered.length ? (
              <p className="px-2 text-sm italic" style={{ color: 'hsl(var(--foreground-muted))' }}>
                All caught up — no undated tasks.
              </p>
            ) : null}
          </ul>
        </aside>
      ) : null}
    </>
  )
}

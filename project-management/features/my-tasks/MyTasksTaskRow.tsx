'use client'

/**
 * MyTasksTaskRow — single task line with complete, projects, due, and detail link.
 */
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Checkbox } from '@/components/ui/checkbox'
import { updateTask } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import type { Project, Task } from '../../types'
import { MyTasksDuePopover } from './MyTasksDuePopover'

type Props = {
  task: Task
  projectById: Map<string, Project>
  onOpen: () => void
  draggable?: boolean
}

/** Compact task row for My Tasks list and board cards. */
export function MyTasksTaskRow({ task, projectById, onOpen, draggable = true }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const sortable = useSortable({ id: task.id, disabled: !draggable })

  const toggleComplete = async () => {
    if (!currentUserId) return
    if (task.completed) await updateTask(task.id, { completed: false }, currentUserId)
    else await updateTask(task.id, { completed: true, completedById: currentUserId }, currentUserId)
  }

  const chips = task.projectIds
    .map((id) => projectById.get(id))
    .filter((p): p is Project => Boolean(p))

  return (
    <div
      ref={sortable.setNodeRef}
      className="group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm"
      style={{
        borderColor: 'var(--border-subtle)',
        background: 'var(--bg-elevated)',
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.5 : 1,
      }}
      {...(draggable ? sortable.attributes : {})}
      {...(draggable ? sortable.listeners : {})}
    >
      <Checkbox
        checked={task.completed}
        onCheckedChange={() => void toggleComplete()}
        onClick={(e) => e.stopPropagation()}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
      />
      <button type="button" className="min-w-0 flex-1 truncate text-left font-medium" onClick={onOpen}>
        {task.name}
      </button>
      <div className="hidden flex-wrap gap-1 sm:flex">
        {chips.map((p) => (
          <span
            key={p.id}
            className="max-w-[100px] truncate rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: 'var(--bg-muted)', color: 'var(--ink-muted)' }}
          >
            {p.name}
          </span>
        ))}
      </div>
      <MyTasksDuePopover task={task} />
    </div>
  )
}

'use client'

/**
 * MyTasksBoardColumn — Kanban column for a personal section.
 */
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Project, Task } from '../../types'
import { MyTasksTaskRow } from './MyTasksTaskRow'
import type { MyTasksSectionId } from './types'

type Props = {
  sectionId: MyTasksSectionId
  label: string
  tasks: Task[]
  collapsed: boolean
  projectById: Map<string, Project>
  onToggleCollapse: () => void
  onOpenTask: (id: string) => void
}

/** Single board column in My Tasks. */
export function MyTasksBoardColumn({
  sectionId,
  label,
  tasks,
  collapsed,
  projectById,
  onToggleCollapse,
  onOpenTask,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${sectionId}` })

  return (
    <div
      className="flex w-72 shrink-0 flex-col rounded-xl border"
      style={{
        borderColor: isOver ? 'hsl(var(--primary))' : 'hsl(var(--border))',
        background: 'hsl(var(--surface-muted))',
      }}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: 'hsl(var(--border))' }}>
        <button type="button" onClick={onToggleCollapse}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <h3 className="font-sans text-sm font-medium">{label}</h3>
        <span className="text-xs tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {tasks.length}
        </span>
      </div>
      {!collapsed ? (
        <div ref={setNodeRef} className="flex max-h-[calc(100vh-18rem)] flex-col gap-2 overflow-y-auto p-2">
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <MyTasksTaskRow
                key={task.id}
                task={task}
                projectById={projectById}
                onOpen={() => onOpenTask(task.id)}
              />
            ))}
          </SortableContext>
        </div>
      ) : null}
    </div>
  )
}

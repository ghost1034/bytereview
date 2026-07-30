'use client'

/** EventChip — draggable task chip with project color prefix. */
import type { Project, Task } from '../../../types'
import { chipColor } from './calendarUtils'

type Props = {
  task: Task
  project: Project
  onOpen: () => void
  onDragStart: (taskId: string, e: React.DragEvent) => void
  compact?: boolean
}

export function EventChip({ task, project, onOpen, onDragStart, compact }: Props) {
  const color = chipColor(project)

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => onDragStart(task.id, e)}
      className={`flex w-full min-w-0 items-center gap-1 truncate rounded px-1 py-0.5 text-left leading-tight ${
        compact ? 'text-[10px]' : 'text-[11px]'
      }`}
      style={{ background: 'var(--bg-muted)', color: 'var(--ink-secondary)' }}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      title={task.name}
    >
      <span className="h-3 w-1 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{task.name}</span>
    </button>
  )
}

'use client'

/** MultiDayBar — horizontal span bar across day cells. */
import type { Project, Task } from '../../../types'
import { chipColor } from './calendarUtils'

type Props = {
  task: Task
  project: Project
  span: number
  continuesLeft: boolean
  continuesRight: boolean
  onOpen: () => void
  onDragStart: (taskId: string, e: React.DragEvent) => void
}

export function MultiDayBar({
  task,
  project,
  span,
  continuesLeft,
  continuesRight,
  onOpen,
  onDragStart,
}: Props) {
  const color = chipColor(project)
  const radiusLeft = continuesLeft ? '0' : '0.375rem'
  const radiusRight = continuesRight ? '0' : '0.375rem'

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => onDragStart(task.id, e)}
      className="absolute top-7 z-[1] flex h-5 min-w-0 items-center truncate px-1.5 text-left text-[10px] font-medium"
      style={{
        gridColumn: `span ${span}`,
        background: color,
        color: 'hsl(var(--primary-foreground))',
        borderTopLeftRadius: radiusLeft,
        borderBottomLeftRadius: radiusLeft,
        borderTopRightRadius: radiusRight,
        borderBottomRightRadius: radiusRight,
        opacity: 0.92,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      title={task.name}
    >
      {task.name}
    </button>
  )
}

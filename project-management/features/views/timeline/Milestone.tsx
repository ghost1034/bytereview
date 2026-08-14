'use client'

/**
 * Diamond milestone marker at a single date.
 */
import { Check } from 'lucide-react'
import type { Task } from '../../../types'
import { CRITICAL_PATH_COLOR } from './constants'

type Props = {
  task: Task
  x: number
  rowTop: number
  color: string
  critical: boolean
  onOpen: () => void
}

export function Milestone({ task, x, rowTop, color, critical, onOpen }: Props) {
  const size = 14
  const top = rowTop + 11
  const overdue = task.dueOn && !task.completed && new Date(task.dueOn) < new Date()

  return (
    <button
      type="button"
      className="absolute z-[6]"
      style={{ left: x - size / 2, top: top - size / 2, width: size, height: size }}
      onClick={onOpen}
      title={`${task.name}${task.dueOn ? ` · ${task.dueOn}` : ''}`}
    >
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
        <polygon
          points="7,1 13,7 7,13 1,7"
          fill={critical ? CRITICAL_PATH_COLOR : color}
          stroke={critical ? 'hsl(var(--background))' : overdue ? 'hsl(var(--destructive))' : 'hsl(var(--border-strong))'}
          strokeWidth={critical ? 2.5 : 1}
        />
      </svg>
      {critical ? (
        <span
          className="absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ring-1 ring-background"
          style={{ background: CRITICAL_PATH_COLOR }}
          aria-hidden
        />
      ) : null}
      {task.completed ? (
        <Check className="absolute inset-0 m-auto h-2.5 w-2.5" style={{ color: 'hsl(var(--primary-foreground))' }} />
      ) : null}
    </button>
  )
}

'use client'

/**
 * Ghost baseline bars above current task bars.
 */
import type { BaselineSnapshot } from './types'
import type { Task } from '../../../types'
import { barGeometry } from './useTimelineDnd'
import { ROW_H } from './constants'
import type { ZoomLevel } from './types'

type Props = {
  tasks: Task[]
  baseline: BaselineSnapshot
  taskRowIndex: Map<string, number>
  rangeStart: Date
  zoom: ZoomLevel
}

export function BaselineLayer({ tasks, baseline, taskRowIndex, rangeStart, zoom }: Props) {
  return (
    <>
      {tasks.map((task) => {
        const snap = baseline.tasks[task.id]
        if (!snap?.startOn && !snap?.dueOn) return null
        const row = taskRowIndex.get(task.id)
        if (row === undefined) return null
        const ghost: Task = {
          ...task,
          startOn: snap.startOn,
          dueOn: snap.dueOn ?? snap.startOn,
        }
        const geom = barGeometry(ghost, rangeStart, zoom)
        if (!geom) return null
        return (
          <div
            key={`bl-${task.id}`}
            className="pointer-events-none absolute rounded border border-dashed"
            style={{
              left: geom.left,
              top: row * ROW_H + 4,
              width: geom.width,
              height: 4,
              borderColor: 'hsl(var(--foreground-subtle))',
              background: 'hsl(var(--surface-muted))',
              opacity: 0.7,
            }}
          />
        )
      })}
    </>
  )
}

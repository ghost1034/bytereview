'use client'

/** MonthGrid — 6×7 month calendar with multi-day bars and heat strip. */
import { memo, useMemo } from 'react'
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { Project, Task } from '../../../types'
import { dateKey, layoutMultiDayBars, taskCountOnDay } from './calendarUtils'
import { DayCell } from './DayCell'
import { MultiDayBar } from './MultiDayBar'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Props = {
  cursor: Date
  project: Project
  tasks: Task[]
  showWeekends: boolean
  highlightKey?: string | null
  onOpenTask: (id: string) => void
  onDragStart: (taskId: string, e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, key: string) => void
}

export const MonthGrid = memo(function MonthGrid({
  cursor,
  project,
  tasks,
  showWeekends,
  highlightKey,
  onOpenTask,
  onDragStart,
  onDrop,
}: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [cursor])

  const rows = useMemo(() => {
    const chunks: Date[][] = []
    for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7))
    return chunks
  }, [days])

  const maxCount = useMemo(
    () => Math.max(1, ...days.map((d) => taskCountOnDay(tasks, dateKey(d)))),
    [days, tasks]
  )

  return (
    <div>
      <div className="mb-2 flex gap-0.5 px-1">
        {days.map((d) => {
          const key = dateKey(d)
          const count = taskCountOnDay(tasks, key)
          const intensity = count / maxCount
          return (
            <div
              key={`heat-${key}`}
              className="h-4 flex-1 rounded-sm"
              title={`${format(d, 'MMM d')}: ${count} tasks`}
              style={{
                background: `color-mix(in srgb, hsl(var(--primary)) ${Math.round(intensity * 80 + 10)}%, transparent)`,
                outline: highlightKey === key ? '2px solid hsl(var(--primary))' : undefined,
              }}
            />
          )
        })}
      </div>

      <div
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <div
          className="grid grid-cols-7 border-b text-center text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: 'hsl(var(--surface-muted))',
            color: 'hsl(var(--foreground-muted))',
            borderColor: 'hsl(var(--border))',
          }}
        >
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 py-2">
              {d}
            </div>
          ))}
        </div>

        {rows.map((rowDays, rowIndex) => {
          const bars = layoutMultiDayBars(tasks, rowDays, rowIndex)
          return (
            <div
              key={rowIndex}
              className="relative grid grid-cols-7"
              style={{ gridAutoRows: 'minmax(88px, 1fr)' }}
            >
              {rowDays.map((day) => (
                <DayCell
                  key={dateKey(day)}
                  day={day}
                  cursor={cursor}
                  project={project}
                  tasks={tasks}
                  showWeekends={showWeekends}
                  onOpenTask={onOpenTask}
                  onDragStart={onDragStart}
                  onDrop={onDrop}
                />
              ))}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-7">
                {bars.map((bar) => (
                  <div
                    key={`${bar.task.id}-${rowIndex}`}
                    className="relative pointer-events-auto"
                    style={{ gridColumn: `${bar.startCol + 1} / span ${bar.span}` }}
                  >
                    <MultiDayBar
                      task={bar.task}
                      project={project}
                      span={bar.span}
                      continuesLeft={bar.continuesLeft}
                      continuesRight={bar.continuesRight}
                      onOpen={() => onOpenTask(bar.task.id)}
                      onDragStart={onDragStart}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

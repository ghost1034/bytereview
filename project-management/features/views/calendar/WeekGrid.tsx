'use client'

/** WeekGrid — seven-day week row with multi-day bars. */
import { memo, useMemo } from 'react'
import { eachDayOfInterval, endOfWeek, format, startOfWeek } from 'date-fns'
import type { Project, Task } from '../../../types'
import { dateKey, layoutMultiDayBars } from './calendarUtils'
import { DayCell } from './DayCell'
import { MultiDayBar } from './MultiDayBar'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Props = {
  cursor: Date
  project: Project
  tasks: Task[]
  showWeekends: boolean
  onOpenTask: (id: string) => void
  onDragStart: (taskId: string, e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, key: string) => void
}

export const WeekGrid = memo(function WeekGrid({
  cursor,
  project,
  tasks,
  showWeekends,
  onOpenTask,
  onDragStart,
  onDrop,
}: Props) {
  const days = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 0 })
    const end = endOfWeek(cursor, { weekStartsOn: 0 })
    return eachDayOfInterval({ start, end })
  }, [cursor])

  const bars = layoutMultiDayBars(tasks, days, 0)

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
      <div
        className="grid grid-cols-7 border-b text-center text-[10px] font-semibold uppercase tracking-wide"
        style={{
          background: 'hsl(var(--surface-muted))',
          color: 'hsl(var(--foreground-muted))',
          borderColor: 'hsl(var(--border))',
        }}
      >
        {WEEKDAYS.map((d, i) => (
          <div key={d} className="px-1 py-2">
            {d} {format(days[i], 'd')}
          </div>
        ))}
      </div>
      <div className="relative grid grid-cols-7" style={{ gridAutoRows: 'minmax(160px, 1fr)' }}>
        {days.map((day) => (
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
            minHeight="min-h-[160px]"
          />
        ))}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-7">
          {bars.map((bar) => (
            <div
              key={bar.task.id}
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
    </div>
  )
})

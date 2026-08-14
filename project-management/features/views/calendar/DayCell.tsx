'use client'

/** DayCell — single calendar day with chips, drop target, and quick add. */
import { memo, useState } from 'react'
import { format, isSameMonth, isToday } from 'date-fns'
import { Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Project, Task } from '../../../types'
import { dateKey, isWeekend, singleDayTasks } from './calendarUtils'
import { DayQuickAdd } from './DayQuickAdd'
import { EventChip } from './EventChip'

type Props = {
  day: Date
  cursor: Date
  project: Project
  tasks: Task[]
  showWeekends: boolean
  onOpenTask: (id: string) => void
  onDragStart: (taskId: string, e: React.DragEvent) => void
  onDrop: (e: React.DragEvent, key: string) => void
  minHeight?: string
}

export const DayCell = memo(function DayCell({
  day,
  cursor,
  project,
  tasks,
  showWeekends,
  onOpenTask,
  onDragStart,
  onDrop,
  minHeight = 'min-h-[88px]',
}: Props) {
  const key = dateKey(day)
  const dayTasks = singleDayTasks(tasks, key)
  const inMonth = isSameMonth(day, cursor)
  const today = isToday(day)
  const weekend = isWeekend(day)
  const overflow = dayTasks.length - 3
  const [adding, setAdding] = useState(false)
  const [hover, setHover] = useState(false)

  if (!showWeekends && weekend) {
    return (
      <div
        className={`${minHeight} border-b border-r`}
        style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--surface-muted))', opacity: 0.35 }}
      />
    )
  }

  return (
    <div
      className={`group relative flex flex-col border-b border-r p-1 ${minHeight}`}
      style={{
        borderColor: 'hsl(var(--border))',
        background: today
          ? 'hsl(var(--primary-soft))'
          : weekend
            ? 'color-mix(in srgb, hsl(var(--surface-muted)) 60%, hsl(var(--card)))'
            : inMonth
              ? 'hsl(var(--card))'
              : 'hsl(var(--surface-muted))',
        opacity: inMonth ? 1 : 0.55,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, key)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (!adding) setAdding(true)
      }}
    >
      <div className="mb-1 flex items-start justify-between">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs"
          style={{
            fontWeight: today ? 700 : 400,
            color: today ? 'hsl(var(--primary))' : 'hsl(var(--foreground-muted))',
            background: today ? 'hsl(var(--card))' : 'transparent',
            boxShadow: today ? '0 0 0 2px hsl(var(--primary))' : undefined,
          }}
        >
          {format(day, 'd')}
        </span>
        {(hover || adding) && !adding ? (
          <button
            type="button"
            className="rounded p-0.5 opacity-0 group-hover:opacity-100"
            style={{ color: 'hsl(var(--foreground-muted))' }}
            onClick={(e) => {
              e.stopPropagation()
              setAdding(true)
            }}
            aria-label="Add task"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {adding ? (
        <div onClick={(e) => e.stopPropagation()}>
          <DayQuickAdd
            workspaceId={project.workspaceId}
            projectId={project.id}
            dueOn={key}
            onDone={() => setAdding(false)}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-0.5 overflow-hidden pt-6">
          {dayTasks.slice(0, 3).map((task) => (
            <EventChip
              key={task.id}
              task={task}
              project={project}
              onOpen={() => onOpenTask(task.id)}
              onDragStart={onDragStart}
            />
          ))}
          {overflow > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="px-1 text-left text-[10px]"
                  style={{ color: 'hsl(var(--foreground-muted))' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  +{overflow} more
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <ul className="space-y-1">
                  {dayTasks.map((task) => (
                    <li key={task.id}>
                      <EventChip
                        task={task}
                        project={project}
                        onOpen={() => onOpenTask(task.id)}
                        onDragStart={onDragStart}
                      />
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      )}
    </div>
  )
})

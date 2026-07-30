'use client'

/**
 * MyTasksDuePopover — inline due-date reschedule for My Tasks rows.
 */
import { useState } from 'react'
import { addDays, startOfToday } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { setDue } from '../../lib/taskActions'
import { formatDate, parseISODateLocal, toISODate } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import type { Task } from '../../types'

type Props = { task: Task }

/** Compact due-date editor for list rows. */
export function MyTasksDuePopover({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [open, setOpen] = useState(false)

  const apply = async (dueOn: string | null) => {
    if (!currentUserId) return
    await setDue(task.id, { dueOn }, currentUserId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs hover:bg-[var(--bg-muted)]"
          style={{ color: task.dueOn ? 'var(--ink-secondary)' : 'var(--ink-faint)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarIcon className="h-3 w-3" />
          {task.dueOn ? formatDate(task.dueOn) : 'No date'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="tl-popover-surface w-fit p-2" align="end">
        <div className="mb-2 flex flex-wrap gap-1">
          {[
            { label: 'Today', date: startOfToday() },
            { label: 'Tomorrow', date: addDays(startOfToday(), 1) },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              className="rounded-md px-2 py-1 text-xs hover:bg-[var(--bg-muted)]"
              onClick={() => void apply(toISODate(q.date))}
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs hover:bg-[var(--bg-muted)]"
            style={{ color: 'var(--danger)' }}
            onClick={() => void apply(null)}
          >
            Clear
          </button>
        </div>
        <Calendar mode="single" selected={task.dueOn ? parseISODateLocal(task.dueOn) : undefined} onSelect={(d) => void apply(d ? toISODate(d) : null)} />
      </PopoverContent>
    </Popover>
  )
}

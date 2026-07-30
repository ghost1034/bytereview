'use client'

/**
 * TaskDueDateField — start+due range, quick picks, optional due time.
 */
import { useState } from 'react'
import { addDays, addWeeks, nextMonday, startOfToday } from 'date-fns'
import { CalendarIcon, Clock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { setDue } from '../../lib/taskActions'
import { combineDateAndTime, formatDate, parseISODateLocal, timeFromISO, toISODate } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import type { Task } from '../../types'

type Props = { task: Task }

const QUICK = [
  { label: 'Today', fn: () => startOfToday() },
  { label: 'Tomorrow', fn: () => addDays(startOfToday(), 1) },
  { label: 'Next Monday', fn: () => nextMonday(startOfToday()) },
  { label: 'In 1 week', fn: () => addWeeks(startOfToday(), 1) },
] as const

export function TaskDueDateField({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [open, setOpen] = useState(false)
  const [showStart, setShowStart] = useState(Boolean(task.startOn))
  const [showTime, setShowTime] = useState(Boolean(task.dueAt))
  const isMilestone = task.resourceSubtype === 'milestone'

  const label = task.dueOn
    ? `${task.startOn && !isMilestone ? `${formatDate(task.startOn)} – ` : ''}${formatDate(task.dueOn)}${task.dueAt ? ` ${timeFromISO(task.dueAt)}` : ''}`
    : 'No due date'

  const apply = async (patch: { startOn?: string | null; dueOn?: string | null; dueAt?: string | null }) => {
    if (!currentUserId) return
    await setDue(task.id, patch, currentUserId)
  }

  const onSelectDue = async (date: Date | undefined) => {
    if (!date) return
    await apply({ dueOn: toISODate(date) })
  }

  const onSelectStart = async (date: Date | undefined) => {
    if (!date || isMilestone) return
    await apply({ startOn: toISODate(date) })
  }

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span style={{ color: 'var(--ink-muted)' }}>{isMilestone ? 'Milestone date' : 'Due date'}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1.5 font-medium">
            <CalendarIcon className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="tl-popover-surface w-fit p-3" align="end">
          <div className="mb-2 flex flex-wrap gap-1">
            {QUICK.map((q) => (
              <button
                key={q.label}
                type="button"
                className="rounded-md px-2 py-1 text-xs hover:bg-[var(--bg-muted)]"
                onClick={() => void apply({ dueOn: toISODate(q.fn()) })}
              >
                {q.label}
              </button>
            ))}
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs hover:bg-[var(--bg-muted)]"
              style={{ color: 'var(--danger)' }}
              onClick={() => void apply({ startOn: null, dueOn: null, dueAt: null })}
            >
              Clear
            </button>
          </div>
          {!isMilestone ? (
            <div className="mb-2 flex items-center gap-2">
              <Checkbox id="start-toggle" checked={showStart} onCheckedChange={(v) => setShowStart(Boolean(v))} />
              <Label htmlFor="start-toggle" className="text-xs">
                Set start date
              </Label>
            </div>
          ) : null}
          {showStart && !isMilestone ? (
            <div className="mb-2">
              <p className="mb-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
                Start
              </p>
              <Calendar
                mode="single"
                selected={task.startOn ? parseISODateLocal(task.startOn) : undefined}
                onSelect={(d) => void onSelectStart(d)}
              />
            </div>
          ) : null}
          <p className="mb-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
            {isMilestone ? 'Date' : 'Due'}
          </p>
          <Calendar
            mode="single"
            selected={task.dueOn ? parseISODateLocal(task.dueOn) : undefined}
            onSelect={(d) => void onSelectDue(d)}
          />
          <div className="mt-2 flex items-center gap-2">
            <Checkbox id="time-toggle" checked={showTime} onCheckedChange={(v) => setShowTime(Boolean(v))} />
            <Label htmlFor="time-toggle" className="text-xs">
              Add time
            </Label>
          </div>
          {showTime && task.dueOn ? (
            <div className="mt-2 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
              <Input
                type="time"
                className="tl-input h-8 w-28 text-sm"
                defaultValue={timeFromISO(task.dueAt)}
                onChange={(e) => {
                  if (!task.dueOn || !e.target.value) return
                  void apply({ dueAt: combineDateAndTime(task.dueOn, e.target.value) })
                }}
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

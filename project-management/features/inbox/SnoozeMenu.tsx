'use client'

/** SnoozeMenu — preset and custom snooze options for a notification. */
import { useState, type ReactNode } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  snooze,
  snoozePresetLaterToday,
  snoozePresetNextWeek,
  snoozePresetTomorrow,
} from '../../lib/notifications'
import { combineDateAndTime, toISODate } from '../../lib/time'

type Props = {
  notificationId: string
  onSnoozed?: () => void
  trigger?: ReactNode
}

/** Dropdown snooze actions for one notification. */
export function SnoozeMenu({ notificationId, onSnoozed, trigger }: Props) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customDate, setCustomDate] = useState<Date | undefined>()
  const [customTime, setCustomTime] = useState('09:00')

  const apply = async (until: string) => {
    await snooze(notificationId, until)
    setCustomOpen(false)
    onSnoozed?.()
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" aria-label="Snooze">
            <Clock className="mr-1 h-3.5 w-3.5" /> Snooze
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="tl-popover-surface w-56 p-2" align="end">
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-muted)]"
              onClick={() => void apply(snoozePresetLaterToday())}
            >
              Later today
            </button>
          </li>
          <li>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-muted)]"
              onClick={() => void apply(snoozePresetTomorrow())}
            >
              Tomorrow morning
            </button>
          </li>
          <li>
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-muted)]"
              onClick={() => void apply(snoozePresetNextWeek())}
            >
              Next week
            </button>
          </li>
        </ul>
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-muted)]"
            >
              Custom date…
            </button>
          </PopoverTrigger>
          <PopoverContent className="tl-popover-surface w-fit p-2" align="start">
            <Calendar mode="single" selected={customDate} onSelect={setCustomDate} />
            <input
              type="time"
              className="mt-2 w-full rounded-md border px-2 py-1 text-sm"
              style={{ borderColor: 'var(--border-subtle)' }}
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
            />
            <Button
              size="sm"
              className="mt-2 w-full"
              disabled={!customDate}
              onClick={() => {
                if (!customDate) return
                void apply(combineDateAndTime(toISODate(customDate), customTime))
              }}
            >
              Snooze until
            </Button>
          </PopoverContent>
        </Popover>
      </PopoverContent>
    </Popover>
  )
}

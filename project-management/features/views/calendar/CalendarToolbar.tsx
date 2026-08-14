'use client'

/** CalendarToolbar — navigation, mode toggle, and view options. */
import { addMonths, addWeeks, endOfWeek, format, startOfWeek, subMonths, subWeeks } from 'date-fns'
import { CalendarIcon, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CalendarMode } from './calendarUtils'

type Props = {
  cursor: Date
  mode: CalendarMode
  showWeekends: boolean
  onCursorChange: (d: Date) => void
  onModeChange: (m: CalendarMode) => void
  onShowWeekendsChange: (v: boolean) => void
  drawerToggle: React.ReactNode
}

export function CalendarToolbar({
  cursor,
  mode,
  showWeekends,
  onCursorChange,
  onModeChange,
  onShowWeekendsChange,
  drawerToggle,
}: Props) {
  const prev = () =>
    onCursorChange(mode === 'week' ? subWeeks(cursor, 1) : subMonths(cursor, 1))
  const next = () =>
    onCursorChange(mode === 'week' ? addWeeks(cursor, 1) : addMonths(cursor, 1))
  const goToday = () => onCursorChange(new Date())

  const weekStart = startOfWeek(cursor, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 0 })
  const label =
    mode === 'week'
      ? `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
      : format(cursor, 'MMMM yyyy')

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="outline" size="sm" onClick={prev} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToday}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={next} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-1 gap-1.5 font-sans text-lg">
              <CalendarIcon className="h-4 w-4" />
              {label}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-fit p-0" align="start">
            <Calendar
              mode="single"
              selected={cursor}
              onSelect={(d) => d && onCursorChange(d)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {drawerToggle}
        <Button
          variant={showWeekends ? 'outline' : 'default'}
          size="sm"
          onClick={() => onShowWeekendsChange(!showWeekends)}
        >
          {showWeekends ? 'Hide weekends' : 'Show weekends'}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <div className="flex rounded-lg border p-0.5" style={{ borderColor: 'hsl(var(--border))' }}>
          {(['month', 'week'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="rounded-md px-3 py-1 text-xs font-medium capitalize"
              style={{
                background: mode === m ? 'hsl(var(--primary-soft))' : 'transparent',
                color: mode === m ? 'hsl(var(--primary))' : 'hsl(var(--foreground-muted))',
              }}
              onClick={() => onModeChange(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

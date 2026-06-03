'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Clock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { useChronaTimeline } from '@/hooks/useChronaDashboard'
import {
  formatClockTime,
  formatDayLabel,
  formatHours,
  toDayString,
} from '@/lib/chrona/format'

/** Shift a local "YYYY-MM-DD" day string by ±n days. */
function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  date.setDate(date.getDate() + delta)
  return toDayString(date)
}

export default function ChronaDeviceTimelinePage() {
  const params = useParams<{ deviceId: string }>()
  const deviceId = params?.deviceId
  const [day, setDay] = useState(() => toDayString(new Date()))

  const timelineQuery = useChronaTimeline({ deviceId, day })
  const cards = useMemo(() => timelineQuery.data?.cards ?? [], [timelineQuery.data])
  const displayName = timelineQuery.data?.display_name

  const totalHours = useMemo(
    () => cards.reduce((acc, c) => acc + (c.end_ts - c.start_ts) / 3600, 0),
    [cards],
  )

  const today = toDayString(new Date())

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        eyebrow={
          <Link
            href="/dashboard/analytics/chrona"
            className="inline-flex items-center gap-1 text-foreground-subtle transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden />
            Time Tracking
          </Link>
        }
        title={displayName ?? 'Device timeline'}
        description={
          cards.length > 0
            ? `${cards.length} card${cards.length === 1 ? '' : 's'} · ${formatHours(totalHours)} tracked on ${formatDayLabel(day)}`
            : `Timeline cards for ${formatDayLabel(day)} (device-local day).`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous day"
              onClick={() => setDay((d) => shiftDay(d, -1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Input
              type="date"
              value={day}
              max={today}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="w-40"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next day"
              disabled={day >= today}
              onClick={() => setDay((d) => shiftDay(d, 1))}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        }
      />

      {timelineQuery.isLoading ? (
        <LoadingState variant="page" label="Loading timeline" />
      ) : timelineQuery.isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <p>
            {timelineQuery.error instanceof Error
              ? timelineQuery.error.message
              : 'Failed to load the timeline.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => timelineQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : cards.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No activity on this day"
          description="No timeline cards were synced for this device-local day. Try another date."
        />
      ) : (
        <ol className="space-y-3">
          {cards.map((card) => (
            <li
              key={card.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium tabular-nums text-foreground-muted">
                    {formatClockTime(card.start_ts)} – {formatClockTime(card.end_ts)}
                    <span className="ml-2 text-foreground-subtle">
                      {formatHours((card.end_ts - card.start_ts) / 3600)}
                    </span>
                  </p>
                  <h3 className="font-semibold text-foreground">{card.title}</h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{card.category}</Badge>
                  {card.subcategory && <Badge variant="outline">{card.subcategory}</Badge>}
                </div>
              </div>
              {card.summary && (
                <p className="mt-2 text-sm text-foreground-muted">{card.summary}</p>
              )}
              {card.detailed_summary && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer select-none text-xs font-medium text-blue-600 hover:underline">
                    Details
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-muted">
                    {card.detailed_summary}
                  </p>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

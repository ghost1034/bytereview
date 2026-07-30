'use client'

/** Dashboard summary card for reporting home grid. */
import Link from 'next/link'
import { CalendarClock, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { computeChart } from '../../lib/reporting/computeChart'
import type { ReportingDashboard } from '../../lib/reporting/types'
import type { User } from '../../types'
import { formatRelative } from '../../lib/time'
import { ChartRenderer } from './ChartRenderer'
import type { ChartComputeContext } from '../../lib/reporting/computeChart'

type Props = {
  dashboard: ReportingDashboard
  owner?: User
  basePath: string
  dataCtx: ChartComputeContext
}

/** Card with mini chart thumbnails, owner, share scope, schedule badge. */
export function DashboardCard({ dashboard, owner, basePath, dataCtx }: Props) {
  const previewCharts = dashboard.charts.slice(0, 3)
  const visibility = dashboard.visibility ?? (dashboard.sharedWith.length ? 'people' : 'private')
  const visibilityLabel =
    visibility === 'workspace' ? 'Workspace' : visibility === 'people' ? 'Shared' : 'Private'

  return (
    <Link
      href={`${basePath}/reporting/${dashboard.id}`}
      className="tl-card block overflow-hidden shadow-paper-sm transition-shadow hover:shadow-paper-md"
    >
      <div className="grid grid-cols-3 gap-1 border-b p-2" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-muted)' }}>
        {previewCharts.length ? (
          previewCharts.map((chart) => (
            <div key={chart.id} className="h-16 overflow-hidden rounded-md bg-[var(--bg-elevated)] p-1">
              <ChartRenderer chart={chart} data={computeChart(chart, dataCtx)} compact onPointClick={() => undefined} />
            </div>
          ))
        ) : (
          <div className="col-span-3 flex h-16 items-center justify-center text-xs italic" style={{ color: 'var(--ink-muted)' }}>
            No charts yet
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-snug">{dashboard.name}</h3>
          {dashboard.schedule ? (
            <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
              <CalendarClock className="h-3 w-3" />
              Scheduled
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" />
            {owner?.name ?? 'Unknown'}
          </span>
          <span>·</span>
          <span>{visibilityLabel}</span>
          <span>·</span>
          <span>{formatRelative(dashboard.updatedAt ?? dashboard.createdAt)}</span>
        </div>
      </div>
    </Link>
  )
}

'use client'

/** Drill-down side panel listing underlying records for a chart point. */
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { Chart } from '../../types'
import { useGoalsStore, useProjectsStore, useTasksStore } from '../../stores/entities'

type Props = {
  chart: Chart
  recordIds: string[]
  label: string
  basePath: string
  onClose: () => void
}

/** List tasks/projects/goals behind a clicked chart segment. */
export function DrillDownPanel({ chart, recordIds, label, basePath, onClose }: Props) {
  const tasks = useTasksStore((s) => s.list())
  const projects = useProjectsStore((s) => s.list())
  const goals = useGoalsStore((s) => s.list())

  const rows =
    chart.source === 'tasks'
      ? recordIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean)
      : chart.source === 'projects'
        ? recordIds.map((id) => projects.find((p) => p.id === id)).filter(Boolean)
        : chart.source === 'goals'
          ? recordIds.map((id) => goals.find((g) => g.id === id)).filter(Boolean)
          : recordIds.map((id) => projects.find((p) => p.id === id)).filter(Boolean)

  const recordHref = (id: string) => chart.source === 'tasks'
    ? `${basePath}/tasks/${id}`
    : `${basePath}/${chart.source}/${id}`

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-drilldown-title"
      className="tl-card fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col shadow-lg print:hidden"
      style={{ maxHeight: '70vh', background: 'hsl(var(--card))' }}
    >
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'hsl(var(--border))' }}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Drill-down
          </p>
          <p id="dashboard-drilldown-title" className="font-medium">{label}</p>
        </div>
        <Button autoFocus aria-label="Close drill-down" variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {rows.length ? (
          rows.map((row) => (
            <li key={row!.id}>
              <Link
                href={recordHref(row!.id)}
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[hsl(var(--surface-muted))]"
              >
                {'name' in row! ? row!.name : 'Record'}
              </Link>
            </li>
          ))
        ) : (
          <li className="px-3 py-6 text-center text-sm italic" style={{ color: 'hsl(var(--foreground-muted))' }}>
            No records
          </li>
        )}
      </ul>
    </aside>
  )
}

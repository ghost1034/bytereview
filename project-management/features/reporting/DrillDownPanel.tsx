'use client'

/** Drill-down side panel listing underlying records for a chart point. */
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
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

  const openRecord = (id: string) => {
    if (chart.source === 'tasks') {
      router.push(`${basePath}/tasks/${id}`)
      return
    }
    if (chart.source === 'projects') {
      router.push(`${basePath}/projects/${id}`)
    }
  }

  return (
    <aside
      className="tl-card fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col shadow-paper-lg print:hidden"
      style={{ maxHeight: '70vh', background: 'var(--bg-elevated)' }}
    >
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
            Drill-down
          </p>
          <p className="font-medium">{label}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {rows.length ? (
          rows.map((row) => (
            <li key={row!.id}>
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--bg-muted)]"
                onClick={() => openRecord(row!.id)}
              >
                {'name' in row! ? row!.name : 'Record'}
              </button>
            </li>
          ))
        ) : (
          <li className="px-3 py-6 text-center text-sm italic" style={{ color: 'var(--ink-muted)' }}>
            No records
          </li>
        )}
      </ul>
    </aside>
  )
}

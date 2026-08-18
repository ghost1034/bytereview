'use client'

/** Weekly timesheet grid — rows by task, columns by day. */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { entryHours } from '../../../lib/psa/timeEntryUtils'
import { weekDays } from '../../../lib/psa/timeEntryUtils'
import type { Task, TimeEntry } from '../../../types'

type RowKey = string

type Props = {
  entries: TimeEntry[]
  tasks: Task[]
  weekAnchor: Date
  weekStart?: 'monday' | 'sunday'
  readOnly?: boolean
  onCellSave: (taskId: string | undefined, projectId: string | undefined, date: string, hours: number) => void
}

export function TimesheetWeekGrid({ entries, tasks, weekAnchor, weekStart = 'monday', readOnly, onCellSave }: Props) {
  const days = useMemo(() => weekDays(weekAnchor, weekStart), [weekAnchor, weekStart])
  const rows = useMemo(() => {
    const map = new Map<RowKey, { taskId?: string; projectId?: string; label: string }>()
    entries.forEach((e) => {
      const key = e.taskId ?? e.projectId ?? 'misc'
      if (!map.has(key)) {
        const task = e.taskId ? tasks.find((t) => t.id === e.taskId) : undefined
        map.set(key, { taskId: e.taskId, projectId: e.projectId, label: task?.name ?? e.projectId ?? 'General' })
      }
    })
    return [...map.entries()]
  }, [entries, tasks])

  const cellHours = (taskId: string | undefined, projectId: string | undefined, date: string) =>
    entries
      .filter((e) => e.date === date && e.taskId === taskId && e.projectId === projectId)
      .reduce((s, e) => s + entryHours(e), 0)

  const rowTotal = (taskId: string | undefined, projectId: string | undefined) =>
    days.reduce((s, d) => s + cellHours(taskId, projectId, d), 0)

  const dayTotal = (date: string) => entries.filter((e) => e.date === date).reduce((s, e) => s + entryHours(e), 0)

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground overflow-x-auto shadow-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}>
            <th className="px-3 py-2 text-left font-medium">Task / Project</th>
            {days.map((d) => <th key={d} className="px-2 py-2 text-center font-medium font-mono tabular-nums">{d.slice(5)}</th>)}
            <th className="px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, row]) => (
            <tr key={key} className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <td className="px-3 py-2">{row.label}</td>
              {days.map((d) => {
                const h = cellHours(row.taskId, row.projectId, d)
                return (
                  <td key={d} className="px-1 py-1 text-center">
                    {readOnly ? (
                      <span className="font-mono tabular-nums">{h ? h.toFixed(2) : '—'}</span>
                    ) : (
                      <CellEditor hours={h} onSave={(v) => onCellSave(row.taskId, row.projectId, d, v)} />
                    )}
                  </td>
                )
              })}
              <td className="px-3 py-2 text-right font-mono tabular-nums">{rowTotal(row.taskId, row.projectId).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ color: 'hsl(var(--foreground-muted))' }}>
            <td className="px-3 py-2 font-medium">Daily total</td>
            {days.map((d) => <td key={d} className="px-2 py-2 text-center font-mono tabular-nums">{dayTotal(d).toFixed(2)}</td>)}
            <td className="px-3 py-2 text-right font-mono tabular-nums">{entries.reduce((s, e) => s + entryHours(e), 0).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function CellEditor({ hours, onSave }: { hours: number; onSave: (h: number) => void }) {
  const [val, setVal] = useState(hours ? String(hours) : '')
  return (
    <Input
      className="mx-auto h-8 w-14 px-1 text-center font-mono tabular-nums text-xs"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        const n = parseFloat(val)
        if (!Number.isNaN(n) && n >= 0) onSave(n)
      }}
    />
  )
}

export function TimesheetWeekNav({ weekAnchor, onChange }: { weekAnchor: Date; onChange: (d: Date) => void }) {
  const prev = () => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); onChange(d) }
  const next = () => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); onChange(d) }
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={prev}>Prev week</Button>
      <span className="text-sm font-mono tabular-nums">{weekAnchor.toISOString().slice(0, 10)}</span>
      <Button variant="outline" size="sm" onClick={next}>Next week</Button>
    </div>
  )
}

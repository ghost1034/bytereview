'use client'

/** Time tab for task detail pane — export only. */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '../../../stores/auth'
import { useTimeEntriesStore } from '../../../stores/entities'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { entryHours } from '../../../lib/psa/timeEntryUtils'
import { ManualTimeEntryDialog } from './ManualTimeEntryDialog'
import { TaskTrackTimerButton } from './TaskTrackTimerButton'
import { TimeEntryRow } from './TimeEntryRow'
import type { Task } from '../../../types'

type Props = { task: Task }

export function TaskTimeTab({ task }: Props) {
  const userId = useAuthStore((s) => s.currentUserId)
  const entries = useTimeEntriesStore((s) => s.list().filter((e) => e.taskId === task.id))
  const update = useTimeEntriesStore((s) => s.update)
  const remove = useTimeEntriesStore((s) => s.remove)
  const [dialogOpen, setDialogOpen] = useState(false)

  const totals = useMemo(() => {
    const total = entries.reduce((s, e) => s + entryHours(e), 0)
    const billable = entries.filter((e) => e.billable).reduce((s, e) => s + entryHours(e), 0)
    const amount = entries.filter((e) => e.billable).reduce((s, e) => s + (e.amount ?? 0), 0)
    return { total, billable, nonBillable: total - billable, amount }
  }, [entries])

  if (!userId) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex flex-wrap gap-3">
          <span><strong className="font-mono tabular-nums">{totals.total.toFixed(2)}h</strong> logged</span>
          <span className="font-mono tabular-nums">{formatMoney(totals.amount)} billable</span>
          <Badge variant="secondary" className="font-mono tabular-nums">{totals.nonBillable.toFixed(2)}h non-billable</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}><Plus className="mr-1 h-3 w-3" /> Add time</Button>
          <TaskTrackTimerButton task={task} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: 'var(--border-subtle)' }}>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
            <th className="px-3 py-2">Date</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Hours</th>
            <th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Bill</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
          </tr></thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center" style={{ color: 'var(--ink-muted)' }}>No time on this task yet.</td></tr>
            ) : entries.sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
              <TimeEntryRow key={e.id} entry={e} onSubmit={(id) => void update(id, { status: 'submitted', submittedAt: new Date().toISOString() })} onDelete={(id) => void remove(id)} />
            ))}
          </tbody>
        </table>
      </div>
      <ManualTimeEntryDialog open={dialogOpen} onOpenChange={setDialogOpen} workspaceId={task.workspaceId} userId={userId} task={task} />
    </div>
  )
}

'use client'

/** Expenses tab for task detail pane — export only. */
import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '../../../stores/auth'
import { useExpensesStore } from '../../../stores/entities'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { expenseDisplayTotal } from '../../../lib/psa/expenseUtils'
import { ExpenseEntryDialog } from '../expenses/ExpenseEntryDialog'
import type { Task } from '../../../types'

type Props = { task: Task }

export function TaskExpensesTab({ task }: Props) {
  const userId = useAuthStore((s) => s.currentUserId)
  const expenses = useExpensesStore((s) => s.list().filter((e) => e.taskId === task.id))
  const [open, setOpen] = useState(false)

  const totals = useMemo(() => ({
    total: expenses.reduce((s, e) => s + expenseDisplayTotal(e), 0),
    billable: expenses.filter((e) => e.billable).reduce((s, e) => s + (e.billableAmount ?? expenseDisplayTotal(e)), 0),
    reimb: expenses.filter((e) => e.reimbursable).reduce((s, e) => s + expenseDisplayTotal(e), 0),
  }), [expenses])

  if (!userId) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex gap-3 font-mono tabular-nums">
          <span>{formatMoney(totals.total)} total</span>
          <span>{formatMoney(totals.billable)} billable</span>
          <span>{formatMoney(totals.reimb)} reimbursable</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="mr-1 h-3 w-3" /> Add expense</Button>
      </div>
      {expenses.map((e) => (
        <div key={e.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
          <div>
            <p>{e.description}</p>
            <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{e.date} · {e.category}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono tabular-nums">{formatMoney(expenseDisplayTotal(e))}</span>
            {e.billable && <Badge>Billable</Badge>}
          </div>
        </div>
      ))}
      <ExpenseEntryDialog open={open} onOpenChange={setOpen} workspaceId={task.workspaceId} userId={userId} task={task} projectId={task.projectIds[0]} />
    </div>
  )
}

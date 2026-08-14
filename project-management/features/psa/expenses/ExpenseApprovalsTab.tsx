'use client'

/** Expense approval inbox. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { useExpenseReportsStore } from '../../../stores/entities'
import { useExpensesStore } from '../../../stores/entities'
import { runPsaAction } from '../../../lib/psa/actions'
import Link from 'next/link'

type Props = { workspaceId: string; approverId: string }

export function ExpenseApprovalsTab({ workspaceId }: Props) {
  const reports = useExpenseReportsStore((s) => s.list().filter((r) => r.workspaceId === workspaceId && r.status === 'submitted'))
  const standaloneExpenses = useExpensesStore((s) => s.list().filter((expense) => expense.workspaceId === workspaceId && expense.status === 'submitted' && !expense.expenseReportId))
  const [reason, setReason] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)

  const approve = async (id: string) => {
    await runPsaAction('expenseReports', id, 'approve', workspaceId)
  }

  const reject = async (id: string) => {
    if (!reason.trim()) return
    await runPsaAction('expenseReports', id, 'reject', workspaceId, { reason })
    setRejectId(null)
    setReason('')
  }

  if (reports.length === 0 && standaloneExpenses.length === 0) return <p className="py-8 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No expenses or reports pending.</p>

  return (
    <div className="space-y-3">
      {standaloneExpenses.map((expense) => <div key={expense.id} className="rounded-lg border border-border bg-card text-card-foreground flex items-center justify-between gap-3 p-4 shadow-sm"><div><p className="font-medium">{expense.description}</p><p className="font-mono text-sm">{formatMoney(expense.totalAmount ?? expense.amount)}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => void runPsaAction('expenses', expense.id, 'approve', workspaceId)}>Approve</Button><Button size="sm" variant="outline" onClick={() => { const rejection = window.prompt('Rejection reason'); if (rejection) void runPsaAction('expenses', expense.id, 'reject', workspaceId, { reason: rejection }) }}>Reject</Button></div></div>)}
      {reports.map((r) => (
        <div key={r.id} className="rounded-lg border border-border bg-card text-card-foreground p-4 shadow-sm">
          <p className="font-medium">{r.name}</p>
          <p className="font-mono tabular-nums text-sm">{formatMoney(r.totalAmount)}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className=" border-0" onClick={() => void approve(r.id)}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => setRejectId(r.id)}>Reject</Button>
            <Button size="sm" variant="ghost" asChild><Link href={`/dashboard/project-management/w/${workspaceId}/psa/expenses/reports/${r.id}`}>Review items</Link></Button>
          </div>
          {rejectId === r.id && (
            <div className="mt-2 flex gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="rounded-md border border-input bg-background text-foreground" />
              <Button size="sm" variant="destructive" onClick={() => void reject(r.id)}>Confirm</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

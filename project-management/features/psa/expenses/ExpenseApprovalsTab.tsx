'use client'

/** Expense approval inbox. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { now } from '../../../lib/time'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { useExpenseReportsStore, useExpensesStore } from '../../../stores/entities'

type Props = { workspaceId: string; approverId: string }

export function ExpenseApprovalsTab({ workspaceId, approverId }: Props) {
  const reports = useExpenseReportsStore((s) => s.list().filter((r) => r.workspaceId === workspaceId && r.status === 'submitted'))
  const updateReport = useExpenseReportsStore((s) => s.update)
  const updateExpense = useExpensesStore((s) => s.update)
  const [reason, setReason] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)

  const approve = async (id: string) => {
    await updateReport(id, { status: 'approved', approvedById: approverId, approvedAt: now() })
    const report = useExpenseReportsStore.getState().getById(id)
    if (report) await Promise.all(report.expenseIds.map((eid) => updateExpense(eid, { status: 'approved', approved: true, approvedById: approverId, approvedAt: now() })))
  }

  const reject = async (id: string) => {
    if (!reason.trim()) return
    await updateReport(id, { status: 'rejected', rejectedReason: reason })
    const report = useExpenseReportsStore.getState().getById(id)
    if (report) await Promise.all(report.expenseIds.map((eid) => updateExpense(eid, { status: 'draft', rejectedReason: reason })))
    setRejectId(null)
    setReason('')
  }

  if (reports.length === 0) return <p className="py-8 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>No expense reports pending.</p>

  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className="tl-card p-4 shadow-paper-sm">
          <p className="font-medium">{r.name}</p>
          <p className="font-mono tabular-nums text-sm">{formatMoney(r.totalAmount)}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="tl-btn-primary border-0" onClick={() => void approve(r.id)}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => setRejectId(r.id)}>Reject</Button>
          </div>
          {rejectId === r.id && (
            <div className="mt-2 flex gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="tl-input" />
              <Button size="sm" variant="destructive" onClick={() => void reject(r.id)}>Confirm</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

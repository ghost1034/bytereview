'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../../stores/auth'
import { useExpenseReportsStore, useExpensesStore, useUsersStore } from '../../../stores/entities'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { canPerformWorkspaceAction } from '../../../lib/permissions'
import { runPsaAction } from '../../../lib/psa/actions'

export function ExpenseReportDetailPage({ reportId }: { reportId: string }) {
  const { workspaceId, workspace } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const user = useUsersStore((s) => userId ? s.getById(userId) : undefined)
  const report = useExpenseReportsStore((s) => s.getById(reportId))
  const expenses = useExpensesStore((s) => report ? report.expenseIds.map((id) => s.getById(id)).filter(Boolean) : [])
  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const canApprove = canPerformWorkspaceAction(user, workspace, 'approve')
  const canBill = canPerformWorkspaceAction(user, workspace, 'bill')
  usePageMeta({ breadcrumbs: [{ label: 'Expenses' }, { label: report?.name ?? 'Expense report' }] })
  if (!workspaceId || !report || report.workspaceId !== workspaceId) return <p>Expense report not found.</p>
  const act = (action: 'approve' | 'reject' | 'partial-approve' | 'reimburse', payload: Record<string, unknown> = {}) => runPsaAction('expenseReports', report.id, action, workspaceId, payload)
  const partial = () => act('partial-approve', { approvedIds: [...approved], rejectedIds: expenses.map((e) => e!.id).filter((id) => !approved.has(id)), reason })
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-sans text-2xl">{report.name}</h1><p className="font-mono text-sm">{formatMoney(report.totalAmount, report.currency)} · {report.status.replace(/_/g, ' ')}</p></div><div className="flex gap-2">{canApprove && report.status === 'submitted' && <><Button onClick={() => void act('approve')}>Approve all</Button><Button variant="outline" disabled={!reason} onClick={() => void act('reject', { reason })}>Reject all</Button><Button variant="outline" disabled={!reason || approved.size === 0 || approved.size === expenses.length} onClick={() => void partial()}>Approve selected</Button></>}{canBill && ['approved', 'partially_approved'].includes(report.status) && <Button onClick={() => void act('reimburse', { method: 'payroll' })}>Mark reimbursed</Button>}</div></div>
    {canApprove && report.status === 'submitted' && <Input className="tl-input" placeholder="Reason for rejected items" value={reason} onChange={(e) => setReason(e.target.value)} />}
    <div className="tl-card overflow-hidden shadow-sm"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="px-4 py-2">Approve</th><th>Description</th><th>Status</th><th className="px-4 text-right">Amount</th></tr></thead><tbody>{expenses.map((expense) => expense && <tr className="border-b" key={expense.id}><td className="px-4 py-2"><input type="checkbox" disabled={!canApprove || report.status !== 'submitted'} checked={approved.has(expense.id)} onChange={() => setApproved((old) => { const next = new Set(old); if (next.has(expense.id)) next.delete(expense.id); else next.add(expense.id); return next })} /></td><td>{expense.description}</td><td>{expense.status ?? 'draft'}</td><td className="px-4 text-right font-mono">{formatMoney(expense.totalAmount ?? expense.amount)}</td></tr>)}</tbody></table></div>
  </div>
}

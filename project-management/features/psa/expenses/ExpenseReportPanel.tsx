'use client'

/** Expense reports list and create-from-selection. */
import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { newId } from '../../../lib/ids'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { expenseDisplayTotal } from '../../../lib/psa/expenseUtils'
import { useExpenseReportsStore, useExpensesStore } from '../../../stores/entities'
import type { Expense } from '../../../types'
import { runPsaAction } from '../../../lib/psa/actions'

type Props = { workspaceId: string; userId: string; expenses: Expense[] }

export function ExpenseReportPanel({ workspaceId, userId, expenses }: Props) {
  const reports = useExpenseReportsStore((s) => s.list().filter((r) => r.workspaceId === workspaceId && r.userId === userId))
  const addReport = useExpenseReportsStore((s) => s.add)
  const updateExpense = useExpensesStore((s) => s.update)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const createReport = async () => {
    const ids = [...selected]
    if (!name.trim() || ids.length === 0) return
    const rows = expenses.filter((e) => ids.includes(e.id))
    const reimbursableAmount = rows.filter((e) => e.reimbursable).reduce((s, e) => s + expenseDisplayTotal(e), 0)
    const totalAmount = rows.reduce((s, e) => s + expenseDisplayTotal(e), 0)
    const reportId = newId()
    await addReport({
      id: reportId,
      workspaceId,
      userId,
      name: name.trim(),
      expenseIds: ids,
      status: 'draft',
      totalAmount,
      reimbursableAmount,
      currency: 'USD',
    })
    await Promise.all(ids.map((id) => updateExpense(id, { expenseReportId: reportId })))
    setSelected(new Set())
    setName('')
  }

  const submitReport = async (reportId: string) => {
    await runPsaAction('expenseReports', reportId, 'submit', workspaceId)
  }

  return (
    <div className="space-y-4">
      <div className="tl-card p-4 shadow-paper-sm">
        <h3 className="mb-2 font-medium">Create report from selection</h3>
        <div className="flex gap-2">
          <Input placeholder="Report name" value={name} onChange={(e) => setName(e.target.value)} className="tl-input" />
          <Button className="tl-btn-primary border-0" disabled={selected.size === 0} onClick={() => void createReport()}>Create</Button>
        </div>
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto">
          {expenses.filter((e) => !e.expenseReportId).map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
              <span>{e.description}</span>
              <span className="ml-auto font-mono tabular-nums">{formatMoney(expenseDisplayTotal(e))}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="tl-card flex items-center justify-between p-3 shadow-paper-sm">
            <div>
              <Link className="font-medium hover:underline" href={`/dashboard/project-management/w/${workspaceId}/psa/expenses/reports/${r.id}`}>{r.name}</Link>
              <p className="text-sm font-mono tabular-nums" style={{ color: 'var(--ink-muted)' }}>{formatMoney(r.totalAmount)} · reimb {formatMoney(r.reimbursableAmount)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{r.status}</Badge>
              {r.status === 'draft' && <Button size="sm" onClick={() => void submitReport(r.id)}>Submit</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

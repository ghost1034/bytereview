'use client'

/** Full PSA expenses page — entries, reports, approvals. */
import { useMemo, useState } from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useExpensesStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'
import { formatMoney } from '../../lib/billing/formatMoney'
import { expenseDisplayTotal } from '../../lib/psa/expenseUtils'
import { EXPENSE_CATEGORY_LABELS } from '../../lib/psa/constants'
import { ExpenseEntryDialog } from './expenses/ExpenseEntryDialog'
import { ExpenseReportPanel } from './expenses/ExpenseReportPanel'
import { ExpenseApprovalsTab } from './expenses/ExpenseApprovalsTab'
import { canPerformWorkspaceAction } from '../../lib/permissions'
import { runPsaAction } from '../../lib/psa/actions'
import type { Expense } from '../../types'

export function ExpensesPage() {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const workspace = useWorkspacesStore((s) => (workspaceId ? s.getById(workspaceId) : undefined))
  const expenses = useExpensesStore((s) => s.list().filter((e) => e.workspaceId === workspaceId))
  const myExpenses = useMemo(() => expenses.filter((e) => e.userId === userId), [expenses, userId])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mileageOpen, setMileageOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const currentUser = useUsersStore((s) => userId ? s.getById(userId) : undefined)
  const canApprove = canPerformWorkspaceAction(currentUser, workspace, 'approve')
  const canBill = canPerformWorkspaceAction(currentUser, workspace, 'bill')
  const filteredExpenses = statusFilter === 'all' ? myExpenses : myExpenses.filter((expense) => (expense.status ?? 'draft') === statusFilter)

  usePageMeta({ breadcrumbs: [{ label: 'Expenses' }] })

  const total = myExpenses.reduce((s, e) => s + expenseDisplayTotal(e), 0)
  const billable = myExpenses.filter((e) => e.billable).reduce((s, e) => s + (e.billableAmount ?? expenseDisplayTotal(e)), 0)
  const reimb = myExpenses.filter((e) => e.reimbursable).reduce((s, e) => s + expenseDisplayTotal(e), 0)

  if (!workspaceId || !userId) return null

  return (
    <div className="space-y-4" data-tour-page="expenses">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Expenses</h1>
          <p className="text-sm font-mono tabular-nums" style={{ color: 'var(--ink-muted)' }}>
            {formatMoney(total)} total · {formatMoney(billable)} billable · {formatMoney(reimb)} reimbursable
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="tl-btn-primary border-0" size="sm"><Plus className="mr-1 h-4 w-4" /> Add expense <ChevronDown className="ml-1 h-3 w-3" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="tl-popover-surface" align="end">
            <DropdownMenuItem onClick={() => setDialogOpen(true)}>Manual entry</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMileageOpen(true)}>Mileage</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Tabs defaultValue="mine">
        <TabsList><TabsTrigger value="mine">My expenses</TabsTrigger><TabsTrigger value="reports">My reports</TabsTrigger>{canApprove && <TabsTrigger value="approve">To approve</TabsTrigger>}</TabsList>
        <TabsContent value="mine">
          <select aria-label="Filter expense status" className="tl-input mb-3 w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">All statuses</option>{['draft', 'submitted', 'approved', 'rejected', 'reimbursed', 'written_off', 'billed'].map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select>
          <div className="tl-card overflow-hidden shadow-paper-sm">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Category</th>
                <th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Flags</th><th className="px-4 py-2">Status</th>
              </tr></thead>
              <tbody>
                {myExpenses.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--ink-muted)' }}>No expenses yet.</td></tr>
                ) : filteredExpenses.sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                  <tr key={e.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-4 py-2 font-mono tabular-nums">{e.date}</td>
                    <td className="px-4 py-2">{e.description}</td>
                    <td className="px-4 py-2">{EXPENSE_CATEGORY_LABELS[e.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? e.category}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(expenseDisplayTotal(e))}</td>
                    <td className="px-4 py-2 flex gap-1">
                      {e.billable && <Badge variant="default">Billable</Badge>}
                      {e.reimbursable && <Badge variant="secondary">Reimb</Badge>}
                      {e.passThrough && <Badge variant="outline">Pass-through</Badge>}
                      {(e.receiptAttachmentId || e.manualReceipt) && <Badge variant="outline">Receipt</Badge>}
                    </td>
                    <td className="px-4 py-2"><div>{e.status ?? 'draft'}</div><div className="mt-1 flex flex-wrap gap-1">{['draft', 'rejected'].includes(e.status ?? 'draft') && <Button size="sm" variant="ghost" onClick={() => setEditing(e)}>Edit</Button>}{(e.status ?? 'draft') === 'draft' && <Button size="sm" variant="ghost" onClick={() => void runPsaAction('expenses', e.id, 'submit', workspaceId)}>Submit</Button>}<Button size="sm" variant="ghost" onClick={() => void runPsaAction('expenses', e.id, 'duplicate', workspaceId)}>Duplicate</Button>{canBill && e.status === 'approved' && <Button size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Write-off reason'); if (reason) void runPsaAction('expenses', e.id, 'write-off', workspaceId, { reason }) }}>Write off</Button>}{canBill && e.status === 'approved' && e.reimbursable && <Button size="sm" variant="ghost" onClick={() => void runPsaAction('expenses', e.id, 'reimburse', workspaceId, { method: 'payroll' })}>Reimburse</Button>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="reports"><ExpenseReportPanel workspaceId={workspaceId} userId={userId} expenses={myExpenses} /></TabsContent>
        {canApprove && <TabsContent value="approve"><ExpenseApprovalsTab workspaceId={workspaceId} approverId={userId} /></TabsContent>}
      </Tabs>
      <ExpenseEntryDialog open={dialogOpen} onOpenChange={setDialogOpen} workspaceId={workspaceId} userId={userId} mileageRate={workspace?.mileageRate} />
      <ExpenseEntryDialog open={mileageOpen} onOpenChange={setMileageOpen} workspaceId={workspaceId} userId={userId} mileageMode mileageRate={workspace?.mileageRate} />
      {editing && <ExpenseEntryDialog key={editing.id} open expense={editing} onOpenChange={(open) => { if (!open) setEditing(null) }} workspaceId={workspaceId} userId={userId} mileageMode={editing.category === 'mileage'} mileageRate={workspace?.mileageRate} />}
    </div>
  )
}

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
import { useExpensesStore, useWorkspacesStore } from '../../stores/entities'
import { formatMoney } from '../../lib/billing/formatMoney'
import { expenseDisplayTotal } from '../../lib/psa/expenseUtils'
import { EXPENSE_CATEGORY_LABELS } from '../../lib/psa/constants'
import { ExpenseEntryDialog } from './expenses/ExpenseEntryDialog'
import { ExpenseReportPanel } from './expenses/ExpenseReportPanel'
import { ExpenseApprovalsTab } from './expenses/ExpenseApprovalsTab'

export function ExpensesPage() {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const workspace = useWorkspacesStore((s) => (workspaceId ? s.getById(workspaceId) : undefined))
  const expenses = useExpensesStore((s) => s.list().filter((e) => e.workspaceId === workspaceId))
  const myExpenses = useMemo(() => expenses.filter((e) => e.userId === userId), [expenses, userId])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mileageOpen, setMileageOpen] = useState(false)

  usePageMeta({ breadcrumbs: [{ label: 'Expenses' }] })

  const total = myExpenses.reduce((s, e) => s + expenseDisplayTotal(e), 0)
  const billable = myExpenses.filter((e) => e.billable).reduce((s, e) => s + (e.billableAmount ?? expenseDisplayTotal(e)), 0)
  const reimb = myExpenses.filter((e) => e.reimbursable).reduce((s, e) => s + expenseDisplayTotal(e), 0)

  if (!workspaceId || !userId) return null

  return (
    <div className="space-y-4">
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
        <TabsList><TabsTrigger value="mine">My expenses</TabsTrigger><TabsTrigger value="reports">My reports</TabsTrigger><TabsTrigger value="approve">To approve</TabsTrigger></TabsList>
        <TabsContent value="mine">
          <div className="tl-card overflow-hidden shadow-paper-sm">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
                <th className="px-4 py-2">Date</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Category</th>
                <th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Flags</th><th className="px-4 py-2">Status</th>
              </tr></thead>
              <tbody>
                {myExpenses.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--ink-muted)' }}>No expenses yet.</td></tr>
                ) : myExpenses.sort((a, b) => b.date.localeCompare(a.date)).map((e) => (
                  <tr key={e.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <td className="px-4 py-2 font-mono tabular-nums">{e.date}</td>
                    <td className="px-4 py-2">{e.description}</td>
                    <td className="px-4 py-2">{EXPENSE_CATEGORY_LABELS[e.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? e.category}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(expenseDisplayTotal(e))}</td>
                    <td className="px-4 py-2 flex gap-1">
                      {e.billable && <Badge variant="default">Billable</Badge>}
                      {e.reimbursable && <Badge variant="secondary">Reimb</Badge>}
                      {e.passThrough && <Badge variant="outline">Pass-through</Badge>}
                    </td>
                    <td className="px-4 py-2">{e.status ?? 'draft'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="reports"><ExpenseReportPanel workspaceId={workspaceId} userId={userId} expenses={myExpenses} /></TabsContent>
        <TabsContent value="approve"><ExpenseApprovalsTab workspaceId={workspaceId} approverId={userId} /></TabsContent>
      </Tabs>
      <ExpenseEntryDialog open={dialogOpen} onOpenChange={setDialogOpen} workspaceId={workspaceId} userId={userId} mileageRate={workspace?.mileageRate} />
      <ExpenseEntryDialog open={mileageOpen} onOpenChange={setMileageOpen} workspaceId={workspaceId} userId={userId} mileageMode mileageRate={workspace?.mileageRate} />
    </div>
  )
}

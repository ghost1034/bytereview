'use client'

/** Full PSA invoicing — list, wizard, payments, void, JSON export. */
import { useMemo, useState } from 'react'
import { Plus, Download, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useInvoicesStore, useExpensesStore, useTimeEntriesStore } from '../../stores/entities'
import { formatMoney } from '../../lib/billing/formatMoney'
import { getAccountingAdapter } from '../../lib/accounting'
import { InvoiceWizard } from './invoicing/InvoiceWizard'
import { RecordPaymentDialog } from './invoicing/RecordPaymentDialog'
import type { Invoice } from '../../types'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', partial: 'Partial', overdue: 'Overdue', void: 'Void',
}

export function InvoicingPage() {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const invoices = useInvoicesStore((s) => s.list().filter((i) => i.workspaceId === workspaceId))
  const updateInvoice = useInvoicesStore((s) => s.update)
  const updateTime = useTimeEntriesStore((s) => s.update)
  const updateExpense = useExpensesStore((s) => s.update)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null)

  usePageMeta({ breadcrumbs: [{ label: 'Invoicing' }] })

  const outstanding = useMemo(
    () => invoices.reduce((s, i) => s + (i.amountOutstanding ?? i.amount - (i.amountPaid ?? 0)), 0),
    [invoices]
  )

  const voidInvoice = async (inv: Invoice) => {
    await updateInvoice(inv.id, { status: 'void', voidedAt: new Date().toISOString() })
    await Promise.all((inv.timeEntryIds ?? []).map((id) => updateTime(id, { status: 'approved', invoiced: false, invoiceId: undefined })))
    await Promise.all((inv.expenseIds ?? []).map((id) => updateExpense(id, { status: 'approved', invoiced: false, invoiceId: undefined })))
  }

  const exportJson = async (inv: Invoice) => {
    const adapter = getAccountingAdapter()
    const { json } = await adapter.exportInvoice(inv)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${inv.invoiceNumber}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!workspaceId || !userId) return null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Invoicing</h1>
          <p className="text-sm font-mono tabular-nums" style={{ color: 'var(--ink-muted)' }}>{formatMoney(outstanding)} outstanding · {invoices.length} invoices</p>
        </div>
        <Button className="tl-btn-primary border-0" size="sm" onClick={() => setWizardOpen(true)}><Plus className="mr-1 h-4 w-4" /> Generate invoice</Button>
      </div>
      <div className="tl-card overflow-hidden shadow-paper-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
            <th className="px-4 py-2">Invoice #</th><th className="px-4 py-2">Client</th><th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Outstanding</th><th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'var(--ink-muted)' }}>No invoices yet.</td></tr>
            ) : invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((inv) => (
              <tr key={inv.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-4 py-2 font-medium">{inv.invoiceNumber}</td>
                <td className="px-4 py-2">{inv.clientName}</td>
                <td className="px-4 py-2"><Badge variant="outline">{STATUS_LABELS[inv.status] ?? inv.status}</Badge></td>
                <td className="px-4 py-2 font-mono tabular-nums">{inv.dueOn}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(inv.total ?? inv.amount)}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(inv.amountOutstanding ?? inv.amount - (inv.amountPaid ?? 0))}</td>
                <td className="px-4 py-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent className="tl-popover-surface" align="end">
                      <DropdownMenuItem onClick={() => setPayInvoice(inv)}>Record payment</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void updateInvoice(inv.id, { status: 'sent', sentAt: new Date().toISOString() })}>Mark sent</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void exportJson(inv)}><Download className="mr-2 h-3 w-3" /> Export JSON</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void voidInvoice(inv)}>Void</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InvoiceWizard open={wizardOpen} onOpenChange={setWizardOpen} workspaceId={workspaceId} />
      {payInvoice && <RecordPaymentDialog open={!!payInvoice} onOpenChange={() => setPayInvoice(null)} invoice={payInvoice} recordedById={userId} />}
    </div>
  )
}

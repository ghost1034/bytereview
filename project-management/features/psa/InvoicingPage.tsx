'use client'

/** Full PSA invoicing — list, wizard, payments, void, JSON export. */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useInvoicesStore, useUsersStore } from '../../stores/entities'
import { formatMoney } from '../../lib/billing/formatMoney'
import { invoiceOutstandingByCurrency } from '../../lib/billing/selectors'
import { canPerformWorkspaceAction } from '../../lib/permissions'
import { InvoiceWizard } from './invoicing/InvoiceWizard'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', partial: 'Partial', overdue: 'Overdue', void: 'Void',
}

export function InvoicingPage() {
  const { workspaceId, workspace } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const user = useUsersStore((s) => userId ? s.getById(userId) : undefined)
  const invoices = useInvoicesStore((s) => s.list().filter((i) => i.workspaceId === workspaceId))
  const [wizardOpen, setWizardOpen] = useState(false)
  const canBill = canPerformWorkspaceAction(user, workspace, 'bill')

  usePageMeta({ breadcrumbs: [{ label: 'Invoicing' }] })

  const outstanding = useMemo(
    () => invoiceOutstandingByCurrency(invoices),
    [invoices]
  )

  if (!workspaceId || !userId) return null

  return (
    <div className="space-y-4" data-tour-page="invoicing">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sans text-2xl">Invoicing</h1>
          <p className="text-sm font-mono tabular-nums" style={{ color: 'hsl(var(--foreground-muted))' }}>{Object.entries(outstanding).map(([currency, amount]) => formatMoney(amount, currency)).join(' + ') || formatMoney(0, workspace?.defaultCurrency)} outstanding · {invoices.length} invoices</p>
        </div>
        {canBill && <Button className="tl-btn-primary border-0" size="sm" onClick={() => setWizardOpen(true)}><Plus className="mr-1 h-4 w-4" /> Generate invoice</Button>}
      </div>
      <div className="tl-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-muted))' }}>
            <th className="px-4 py-2">Invoice #</th><th className="px-4 py-2">Client</th><th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Outstanding</th><th className="px-4 py-2" />
          </tr></thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: 'hsl(var(--foreground-muted))' }}>No invoices yet.</td></tr>
            ) : invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((inv) => (
              <tr key={inv.id} className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                <td className="px-4 py-2 font-medium"><Link className="hover:underline" href={`/dashboard/project-management/w/${workspaceId}/psa/invoicing/${inv.id}`}>{inv.invoiceNumber}</Link></td>
                <td className="px-4 py-2">{inv.clientName}</td>
                <td className="px-4 py-2"><Badge variant="outline">{STATUS_LABELS[inv.status] ?? inv.status}</Badge></td>
                <td className="px-4 py-2 font-mono tabular-nums">{inv.dueOn}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(inv.total ?? inv.amount, inv.currency)}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(inv.amountOutstanding ?? inv.amount - (inv.amountPaid ?? 0), inv.currency)}</td>
                <td className="px-4 py-2"><Button asChild variant="ghost" size="sm"><Link href={`/dashboard/project-management/w/${workspaceId}/psa/invoicing/${inv.id}`}>Open</Link></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <InvoiceWizard open={wizardOpen} onOpenChange={setWizardOpen} workspaceId={workspaceId} />
    </div>
  )
}

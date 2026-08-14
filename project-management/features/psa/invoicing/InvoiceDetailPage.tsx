'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useBillingAuditRecordsStore, useInvoicesStore, usePaymentsStore } from '../../../stores/entities'
import { canPerformWorkspaceAction } from '../../../lib/permissions'
import { formatMoney } from '../../../lib/billing/formatMoney'
import { createClientInvoicePaymentLink, downloadInvoicePdf, reverseInvoicePayment, runInvoiceAction } from '../../../lib/billing/actions'
import { RecordPaymentDialog } from './RecordPaymentDialog'

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const { workspaceId, workspace } = useWorkspaceContext()
  const user = useCurrentUser()
  const invoice = useInvoicesStore((state) => state.getById(invoiceId))
  const payments = usePaymentsStore((state) => state.list().filter((payment) => payment.invoiceId === invoiceId))
  const audit = useBillingAuditRecordsStore((state) => state.list().filter((entry) => entry.resourceId === invoiceId || entry.details?.invoiceId === invoiceId))
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [narrative, setNarrative] = useState(invoice?.narrative ?? '')
  const [notes, setNotes] = useState(invoice?.notes ?? '')
  const [discount, setDiscount] = useState(String(invoice?.discountAmount ?? 0))
  const [discountReason, setDiscountReason] = useState(invoice?.discountReason ?? '')
  const [paymentLink, setPaymentLink] = useState('')
  const canBill = canPerformWorkspaceAction(user, workspace, 'bill')
  const canApprove = canPerformWorkspaceAction(user, workspace, 'approve')
  const canPay = canPerformWorkspaceAction(user, workspace, 'payment')
  usePageMeta({ breadcrumbs: [{ label: 'Invoicing' }, { label: invoice?.invoiceNumber ?? 'Invoice' }] })
  const age = useMemo(() => invoice ? Math.max(0, Math.floor((Date.now() - new Date(invoice.issueDate ?? invoice.createdAt).getTime()) / 86400000)) : 0, [invoice])
  if (!workspaceId || !invoice || invoice.workspaceId !== workspaceId) return <p>Invoice not found.</p>
  const act = (action: Parameters<typeof runInvoiceAction>[1], payload: Record<string, unknown> = {}) => runInvoiceAction(invoice.id, action, workspaceId, payload)
  const ask = (label: string, action: 'void' | 'write-off') => { const reason = window.prompt(`${label} reason`); if (reason) void act(action, { reason }) }
  const emailInvoice = (action: 'send' | 'resend') => { const recipient = window.prompt('Client email address'); if (recipient) void act(action, { method: 'email', recipient }) }
  const saveDraft = () => act('edit', { patch: { narrative, notes, discountAmount: Number(discount), discountReason } })
  const activePayments = payments.filter((payment) => !payment.originalPaymentId)
  const reversedIds = new Set(payments.filter((payment) => payment.originalPaymentId).map((payment) => payment.originalPaymentId))
  return <div className="space-y-4" data-tour-page="invoice-detail">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="text-sm underline" href={`/dashboard/project-management/w/${workspaceId}/psa/invoicing`}>Back to invoices</Link><div className="mt-2 flex items-center gap-2"><h1 className="font-sans text-2xl">{invoice.invoiceNumber}</h1><Badge variant="outline">{invoice.status.replace(/_/g, ' ')}</Badge></div><p className="text-sm">{invoice.clientName} · issued {invoice.issueDate} · due {invoice.dueOn}</p></div><div className="flex flex-wrap gap-2">
      {canBill && invoice.status === 'draft' && <><Button variant="outline" onClick={() => void saveDraft()}>Save narrative</Button><Button onClick={() => void act('submit')}>Submit invoice</Button></>}
      {canApprove && invoice.status === 'pending_approval' && <Button onClick={() => void act('approve')}>Approve invoice</Button>}
      {canBill && ['draft', 'approved'].includes(invoice.status) && <Button onClick={() => void act('send', { method: 'manual' })}>Record delivery</Button>}
      {canBill && invoice.status === 'approved' && <Button variant="outline" onClick={() => emailInvoice('send')}>Email invoice</Button>}
      {canBill && ['sent', 'partial', 'overdue'].includes(invoice.status) && <Button variant="outline" onClick={() => void act('resend', { method: 'manual' })}>Resend</Button>}
      {canBill && ['sent', 'partial', 'overdue'].includes(invoice.status) && <Button variant="outline" onClick={() => emailInvoice('resend')}>Email again</Button>}
      <Button variant="outline" onClick={() => void downloadInvoicePdf(invoice)}>Download PDF</Button>
      {canPay && ['sent', 'partial', 'overdue'].includes(invoice.status) && <Button onClick={() => setPaymentOpen(true)}>Record payment</Button>}
      {canBill && ['sent', 'partial', 'overdue'].includes(invoice.status) && <Button variant="outline" onClick={() => void createClientInvoicePaymentLink(invoice).then(setPaymentLink)}>Create payment link</Button>}
      {canBill && !['void', 'written_off', 'paid'].includes(invoice.status) && <Button variant="outline" onClick={() => ask('Void', 'void')}>Void</Button>}
      {canBill && ['sent', 'partial', 'overdue'].includes(invoice.status) && <Button variant="outline" onClick={() => ask('Write-off', 'write-off')}>Write off AR</Button>}
    </div></div>
    {paymentLink ? <div className="rounded-lg border border-border bg-card text-card-foreground flex flex-wrap items-center gap-2 p-3" role="status"><span className="text-sm">Client invoice payment link ready.</span><Input aria-label="Client invoice payment link" className="min-w-64 flex-1" readOnly value={paymentLink} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(paymentLink)}>Copy</Button></div> : null}
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]"><main className="space-y-4"><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Invoice narrative</h2>{invoice.status === 'draft' && canBill ? <><Textarea aria-label="Invoice narrative" className="mt-2" value={narrative} onChange={(event) => setNarrative(event.target.value)} /><Textarea aria-label="Invoice notes" className="mt-2" value={notes} onChange={(event) => setNotes(event.target.value)} /><div className="mt-2 grid gap-2 sm:grid-cols-2"><Input aria-label="Discount amount" value={discount} onChange={(event) => setDiscount(event.target.value)} /><Input aria-label="Discount reason" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} /></div></> : <><p className="mt-2 text-sm">{invoice.narrative || 'No summary narrative.'}</p><p className="mt-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{invoice.notes}</p></>}</div><div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th></tr></thead><tbody>{invoice.lineItems.map((line, index) => <tr className="border-b" key={line.id ?? `${line.sourceId}-${index}`}><td className="px-4 py-2">{line.description}</td><td className="px-4 py-2 text-right font-mono">{line.quantity}</td><td className="px-4 py-2 text-right font-mono">{formatMoney(line.rate, invoice.currency)}</td><td className="px-4 py-2 text-right font-mono">{formatMoney(line.amount ?? line.quantity * line.rate, invoice.currency)}</td></tr>)}</tbody><tfoot><tr><td className="px-4 py-2" colSpan={3}>Discount</td><td className="px-4 py-2 text-right font-mono">−{formatMoney(invoice.discountAmount ?? 0, invoice.currency)}</td></tr><tr className="font-medium"><td className="px-4 py-2" colSpan={3}>Total</td><td className="px-4 py-2 text-right font-mono">{formatMoney(invoice.total ?? invoice.amount, invoice.currency)}</td></tr></tfoot></table></div><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Audit history</h2><div className="mt-2 space-y-2">{audit.sort((a, b) => b.at.localeCompare(a.at)).map((entry) => <div className="flex justify-between text-sm" key={entry.id}><span>{entry.action.replace(/_/g, ' ')}</span><span className="font-mono text-xs">{entry.at.slice(0, 19).replace('T', ' ')}</span></div>)}{audit.length === 0 && <p className="text-sm">No billing events.</p>}</div></div></main><aside className="space-y-4"><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Balance</h2><p className="mt-2 font-mono text-2xl">{formatMoney(invoice.amountOutstanding ?? invoice.amount, invoice.currency)}</p><p className="text-sm">{age} days old · {new Date(invoice.dueOn) < new Date() && (invoice.amountOutstanding ?? 0) > 0 ? 'past due' : 'current'}</p></div><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Payments</h2><div className="mt-2 space-y-3">{activePayments.map((payment) => <div className="text-sm" key={payment.id}><div className="flex justify-between"><span>{payment.method.replace(/_/g, ' ')}</span><span className="font-mono">{formatMoney(payment.amount, payment.currency)}</span></div><p className="text-xs">{payment.paidAt} {reversedIds.has(payment.id) ? '· reversed' : ''}</p>{canPay && !reversedIds.has(payment.id) && <Button className="mt-1 h-7" size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Payment reversal reason'); if (reason) void reverseInvoicePayment(payment.id, workspaceId, reason) }}>Reverse</Button>}</div>)}</div></div></aside></div>
    {paymentOpen && <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoice={invoice} />}
  </div>
}

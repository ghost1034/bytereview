'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
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
import { INVOICE_STATUS_LABELS } from '../../../lib/billing/invoicePresentation'
import { createClientInvoicePaymentLink, downloadInvoicePdf, reverseInvoicePayment, runInvoiceAction } from '../../../lib/billing/actions'
import { normalizeUnknownError } from '../../../lib/errors'
import type { InvoiceLineItem, InvoiceStatus } from '../../../types'
import { RecordPaymentDialog } from './RecordPaymentDialog'

const INVOICE_STATUSES = new Set<InvoiceStatus>([
  'draft', 'pending_approval', 'approved', 'sent', 'paid', 'partial',
  'overdue', 'void', 'written_off',
])

function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === 'string' && INVOICE_STATUSES.has(value as InvoiceStatus)
}

function isInvoiceLineItem(value: unknown): value is InvoiceLineItem {
  return Boolean(value) && typeof value === 'object'
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

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
  const [pendingAction, setPendingAction] = useState<Parameters<typeof runInvoiceAction>[1] | null>(null)
  const [actionError, setActionError] = useState('')
  const actionPendingRef = useRef(false)
  const canBill = canPerformWorkspaceAction(user, workspace, 'bill')
  const canApprove = canPerformWorkspaceAction(user, workspace, 'approve')
  const canPay = canPerformWorkspaceAction(user, workspace, 'payment')
  usePageMeta({ breadcrumbs: [{ label: 'Invoicing' }, { label: invoice?.invoiceNumber ?? 'Invoice' }] })
  const age = useMemo(() => {
    if (!invoice) return 0
    const issuedAt = new Date(invoice.issueDate ?? invoice.createdAt).getTime()
    return Number.isFinite(issuedAt) ? Math.max(0, Math.floor((Date.now() - issuedAt) / 86400000)) : 0
  }, [invoice])
  if (!workspaceId || !invoice || invoice.workspaceId !== workspaceId) return <p>Invoice not found.</p>
  const act = async (action: Parameters<typeof runInvoiceAction>[1], payload: Record<string, unknown> = {}) => {
    if (actionPendingRef.current) return
    actionPendingRef.current = true
    setPendingAction(action)
    setActionError('')
    try {
      await runInvoiceAction(invoice.id, action, workspaceId, payload)
    } catch (error) {
      setActionError(normalizeUnknownError(error, 'The invoice could not be updated.').message)
    } finally {
      actionPendingRef.current = false
      setPendingAction(null)
    }
  }
  const ask = (label: string, action: 'void' | 'write-off') => { const reason = window.prompt(`${label} reason`); if (reason) void act(action, { reason }) }
  const emailInvoice = (action: 'send' | 'resend') => { const recipient = window.prompt('Client email address'); if (recipient) void act(action, { method: 'email', recipient }) }
  const saveDraft = () => act('edit', { patch: { narrative, notes, discountAmount: Number(discount), discountReason } })
  const status = isInvoiceStatus(invoice.status) ? invoice.status : null
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems.filter(isInvoiceLineItem) : []
  const workspaceCurrency = typeof workspace?.defaultCurrency === 'string' && /^[A-Z]{3}$/.test(workspace.defaultCurrency)
    ? workspace.defaultCurrency
    : 'USD'
  const currency = typeof invoice.currency === 'string' && /^[A-Z]{3}$/.test(invoice.currency)
    ? invoice.currency
    : workspaceCurrency
  const hydrationWarning = !status || !Array.isArray(invoice.lineItems)
  const busy = pendingAction !== null
  const actionDisabled = busy || hydrationWarning
  const activePayments = payments.filter((payment) => !payment.originalPaymentId)
  const reversedIds = new Set(payments.filter((payment) => payment.originalPaymentId).map((payment) => payment.originalPaymentId))
  return <div className="space-y-4" data-tour-page="invoice-detail">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="text-sm underline" href={`/dashboard/project-management/w/${workspaceId}/psa/invoicing`}>Back to invoices</Link><div className="mt-2 flex items-center gap-2"><h1 className="font-sans text-2xl">{invoice.invoiceNumber || 'Invoice'}</h1><Badge variant="outline">{status ? INVOICE_STATUS_LABELS[status] : 'Status unavailable'}</Badge></div><p className="text-sm">{invoice.clientName || 'Unknown client'} · issued {invoice.issueDate || 'not provided'} · due {invoice.dueOn || 'not provided'}</p></div><div className="flex flex-wrap gap-2">
      {canBill && status === 'draft' && <><Button disabled={actionDisabled} variant="outline" onClick={() => void saveDraft()}>{pendingAction === 'edit' ? 'Saving…' : 'Save narrative'}</Button><Button disabled={actionDisabled} onClick={() => void act('submit')}>{pendingAction === 'submit' ? 'Submitting…' : 'Submit invoice'}</Button></>}
      {canApprove && status === 'pending_approval' && <Button disabled={actionDisabled} onClick={() => void act('approve')}>{pendingAction === 'approve' ? 'Approving…' : 'Approve invoice'}</Button>}
      {canBill && status && ['draft', 'approved'].includes(status) && <Button disabled={actionDisabled} onClick={() => void act('send', { method: 'manual' })}>{pendingAction === 'send' ? 'Recording…' : 'Record delivery'}</Button>}
      {canBill && status === 'approved' && <Button disabled={actionDisabled} variant="outline" onClick={() => emailInvoice('send')}>Email invoice</Button>}
      {canBill && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => void act('resend', { method: 'manual' })}>{pendingAction === 'resend' ? 'Resending…' : 'Resend'}</Button>}
      {canBill && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => emailInvoice('resend')}>Email again</Button>}
      <Button disabled={hydrationWarning} variant="outline" onClick={() => void downloadInvoicePdf(invoice)}>Download PDF</Button>
      {canPay && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} onClick={() => setPaymentOpen(true)}>Record payment</Button>}
      {canBill && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => void createClientInvoicePaymentLink(invoice).then(setPaymentLink)}>Create payment link</Button>}
      {canBill && status && !['void', 'written_off', 'paid'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => ask('Void', 'void')}>{pendingAction === 'void' ? 'Voiding…' : 'Void'}</Button>}
      {canBill && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => ask('Write-off', 'write-off')}>{pendingAction === 'write-off' ? 'Writing off…' : 'Write off AR'}</Button>}
    </div></div>
    {actionError ? <p className="rounded-lg border border-destructive p-3 text-sm text-destructive" role="alert">{actionError}</p> : null}
    {hydrationWarning ? <p className="rounded-lg border border-border bg-card p-3 text-sm" role="alert">Some invoice fields were unavailable. Available details are shown below; lifecycle actions are disabled.</p> : null}
    {paymentLink ? <div className="rounded-lg border border-border bg-card text-card-foreground flex flex-wrap items-center gap-2 p-3" role="status"><span className="text-sm">Client invoice payment link ready.</span><Input aria-label="Client invoice payment link" className="min-w-64 flex-1" readOnly value={paymentLink} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(paymentLink)}>Copy</Button></div> : null}
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]"><main className="space-y-4"><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Invoice narrative</h2>{status === 'draft' && canBill ? <><Textarea aria-label="Invoice narrative" className="mt-2" value={narrative} onChange={(event) => setNarrative(event.target.value)} /><Textarea aria-label="Invoice notes" className="mt-2" value={notes} onChange={(event) => setNotes(event.target.value)} /><div className="mt-2 grid gap-2 sm:grid-cols-2"><Input aria-label="Discount amount" value={discount} onChange={(event) => setDiscount(event.target.value)} /><Input aria-label="Discount reason" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} /></div></> : <><p className="mt-2 text-sm">{invoice.narrative || 'No summary narrative.'}</p><p className="mt-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{invoice.notes}</p></>}</div><div className="rounded-lg border border-border bg-card text-card-foreground overflow-hidden"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th></tr></thead><tbody>{lineItems.map((line, index) => { const quantity = safeNumber(line.quantity); const rate = safeNumber(line.rate); return <tr className="border-b" key={line.id ?? `${line.sourceId}-${index}`}><td className="px-4 py-2">{line.description || 'Invoice item'}</td><td className="px-4 py-2 text-right font-mono">{quantity}</td><td className="px-4 py-2 text-right font-mono">{formatMoney(rate, currency)}</td><td className="px-4 py-2 text-right font-mono">{formatMoney(line.amount === undefined ? quantity * rate : safeNumber(line.amount), currency)}</td></tr> })}</tbody><tfoot><tr><td className="px-4 py-2" colSpan={3}>Discount</td><td className="px-4 py-2 text-right font-mono">−{formatMoney(safeNumber(invoice.discountAmount), currency)}</td></tr><tr className="font-medium"><td className="px-4 py-2" colSpan={3}>Total</td><td className="px-4 py-2 text-right font-mono">{formatMoney(safeNumber(invoice.total ?? invoice.amount), currency)}</td></tr></tfoot></table></div><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Audit history</h2><div className="mt-2 space-y-2">{audit.sort((a, b) => b.at.localeCompare(a.at)).map((entry) => <div className="flex justify-between text-sm" key={entry.id}><span>{entry.action.replace(/_/g, ' ')}</span><span className="font-mono text-xs">{entry.at.slice(0, 19).replace('T', ' ')}</span></div>)}{audit.length === 0 && <p className="text-sm">No billing events.</p>}</div></div></main><aside className="space-y-4"><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Balance</h2><p className="mt-2 font-mono text-2xl">{formatMoney(safeNumber(invoice.amountOutstanding ?? invoice.amount), currency)}</p><p className="text-sm">{age} days old · {new Date(invoice.dueOn) < new Date() && safeNumber(invoice.amountOutstanding) > 0 ? 'past due' : 'current'}</p></div><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Payments</h2><div className="mt-2 space-y-3">{activePayments.map((payment) => <div className="text-sm" key={payment.id}><div className="flex justify-between"><span>{payment.method.replace(/_/g, ' ')}</span><span className="font-mono">{formatMoney(payment.amount, payment.currency)}</span></div><p className="text-xs">{payment.paidAt} {reversedIds.has(payment.id) ? '· reversed' : ''}</p>{canPay && !reversedIds.has(payment.id) && <Button className="mt-1 h-7" size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Payment reversal reason'); if (reason) void reverseInvoicePayment(payment.id, workspaceId, reason) }}>Reverse</Button>}</div>)}</div></div></aside></div>
    {paymentOpen && <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoice={invoice} />}
  </div>
}

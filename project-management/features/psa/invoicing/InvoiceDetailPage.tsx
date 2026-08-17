'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { tasklyticApiJson } from '../../../lib/tasklyticApi'
import type { InvoiceLineItem, InvoiceStatus } from '../../../types'
import { RecordPaymentDialog } from './RecordPaymentDialog'
import { InvoiceDocumentPreview } from './InvoiceDocumentPreview'
import { InvoiceSendDialog } from './InvoiceSendDialog'

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
  const [taxAmount, setTaxAmount] = useState(String(invoice?.taxAmount ?? 0))
  const [taxLabel, setTaxLabel] = useState(invoice?.taxLabel ?? workspace?.billingSettings?.taxLabel ?? 'Tax')
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? '')
  const [dueOn, setDueOn] = useState(invoice?.dueOn ?? '')
  const [linePresentation, setLinePresentation] = useState<'detailed' | 'summary'>(invoice?.linePresentation ?? 'detailed')
  const [billTo, setBillTo] = useState(invoice?.billTo ?? {})
  const [paymentInstructions, setPaymentInstructions] = useState(invoice?.paymentInstructions ?? '')
  const [paymentLink, setPaymentLink] = useState('')
  const [sendAction, setSendAction] = useState<'send' | 'resend' | null>(null)
  const [stripeAvailable, setStripeAvailable] = useState(false)
  const [pendingAction, setPendingAction] = useState<Parameters<typeof runInvoiceAction>[1] | null>(null)
  const [actionError, setActionError] = useState('')
  const actionPendingRef = useRef(false)
  const canBill = canPerformWorkspaceAction(user, workspace, 'bill')
  const canApprove = canPerformWorkspaceAction(user, workspace, 'approve')
  const canPay = canPerformWorkspaceAction(user, workspace, 'payment')
  useEffect(() => {
    if (!workspaceId) return
    void tasklyticApiJson<{ capabilities: Array<{ provider: string; available: boolean }> }>(`/integrations/capabilities?workspace_id=${encodeURIComponent(workspaceId)}`)
      .then(({ capabilities }) => setStripeAvailable(Boolean(capabilities.find((item) => item.provider === 'stripe_connect')?.available)))
      .catch(() => setStripeAvailable(false))
  }, [workspaceId])
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
      return true
    } catch (error) {
      setActionError(normalizeUnknownError(error, 'The invoice could not be updated.').message)
      return false
    } finally {
      actionPendingRef.current = false
      setPendingAction(null)
    }
  }
  const ask = (label: string, action: 'void' | 'write-off') => { const reason = window.prompt(`${label} reason`); if (reason) void act(action, { reason }) }
  const saveDraft = () => act('edit', { patch: { narrative, notes, issueDate, dueOn, discountAmount: Number(discount), discountReason, taxAmount: Number(taxAmount), taxLabel, linePresentation, billTo, paymentInstructions } })
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
      {canBill && status === 'approved' && <Button disabled={actionDisabled} onClick={() => void act('send', { method: 'manual' })}>{pendingAction === 'send' ? 'Recording…' : 'Record delivery'}</Button>}
      {canBill && status === 'approved' && <Button disabled={actionDisabled} variant="outline" onClick={() => setSendAction('send')}>Email invoice</Button>}
      {canBill && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => void act('resend', { method: 'manual' })}>{pendingAction === 'resend' ? 'Resending…' : 'Resend'}</Button>}
      {canBill && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => setSendAction('resend')}>Email again</Button>}
      <Button disabled={hydrationWarning} variant="outline" onClick={() => void downloadInvoicePdf(invoice)}>Download PDF</Button>
      {canPay && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} onClick={() => setPaymentOpen(true)}>Record payment</Button>}
      {canBill && stripeAvailable && status && ['approved', 'sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => void createClientInvoicePaymentLink(invoice).then(setPaymentLink).catch((error) => setActionError(normalizeUnknownError(error, 'The payment link could not be created.').message))}>Create payment link</Button>}
      {canBill && status && !['void', 'written_off', 'paid'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => ask('Void', 'void')}>{pendingAction === 'void' ? 'Voiding…' : 'Void'}</Button>}
      {canBill && status && ['sent', 'partial', 'overdue'].includes(status) && <Button disabled={actionDisabled} variant="outline" onClick={() => ask('Write-off', 'write-off')}>{pendingAction === 'write-off' ? 'Writing off…' : 'Write off AR'}</Button>}
    </div></div>
    {actionError ? <p className="rounded-lg border border-destructive p-3 text-sm text-destructive" role="alert">{actionError}</p> : null}
    {hydrationWarning ? <p className="rounded-lg border border-border bg-card p-3 text-sm" role="alert">Some invoice fields were unavailable. Available details are shown below; lifecycle actions are disabled.</p> : null}
    {paymentLink ? <div className="rounded-lg border border-border bg-card text-card-foreground flex flex-wrap items-center gap-2 p-3" role="status"><span className="text-sm">Client invoice payment link ready.</span><Input aria-label="Client invoice payment link" className="min-w-64 flex-1" readOnly value={paymentLink} /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(paymentLink)}>Copy</Button></div> : null}
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]"><main className="space-y-4"><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Invoice document</h2>{status === 'draft' && canBill ? <div className="mt-3 grid gap-3"><div className="grid gap-2 sm:grid-cols-3"><Input aria-label="Issue date" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /><Input aria-label="Due date" min={issueDate} type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} /><select aria-label="Line presentation" className="h-10 rounded-md border border-input bg-background px-3" value={linePresentation} onChange={(event) => setLinePresentation(event.target.value as typeof linePresentation)}><option value="detailed">Detailed</option><option value="summary">Summarized</option></select></div><Textarea aria-label="Invoice narrative" value={narrative} onChange={(event) => setNarrative(event.target.value)} /><Textarea aria-label="Invoice notes" value={notes} onChange={(event) => setNotes(event.target.value)} /><div className="grid gap-2 sm:grid-cols-3"><Input aria-label="Discount amount" value={discount} onChange={(event) => setDiscount(event.target.value)} /><Input aria-label="Discount reason" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} /><Input aria-label="Tax amount" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} /></div><div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Tax label" value={taxLabel} onChange={(event) => setTaxLabel(event.target.value)} /><Input aria-label="Bill-to name" placeholder="Bill-to name" value={billTo.name ?? ''} onChange={(event) => setBillTo((old) => ({ ...old, name: event.target.value }))} /><Input aria-label="Bill-to contact" placeholder="Contact" value={billTo.contactName ?? ''} onChange={(event) => setBillTo((old) => ({ ...old, contactName: event.target.value }))} /><Input aria-label="Bill-to email" placeholder="Email" type="email" value={billTo.email ?? ''} onChange={(event) => setBillTo((old) => ({ ...old, email: event.target.value }))} /><Textarea aria-label="Bill-to address" placeholder="Billing address" value={billTo.address ?? ''} onChange={(event) => setBillTo((old) => ({ ...old, address: event.target.value }))} /><Textarea aria-label="Payment instructions" placeholder="Payment / remittance instructions" value={paymentInstructions} onChange={(event) => setPaymentInstructions(event.target.value)} /></div></div> : <p className="mt-2 text-sm">This issued document is frozen as version {invoice.documentSnapshot?.version ?? 'legacy'}. Workspace and client changes will not alter it.</p>}</div><InvoiceDocumentPreview issuerName={invoice.documentSnapshot?.issuer.issuerDisplayName ?? workspace?.billingSettings?.issuerDisplayName ?? workspace?.name ?? 'Invoice'} issuerDetails={invoice.documentSnapshot?.issuer.issuerAddress} billToName={invoice.documentSnapshot?.billTo.name ?? invoice.billTo?.name ?? invoice.clientName} billToDetails={[invoice.documentSnapshot?.billTo.address ?? invoice.billTo?.address, invoice.documentSnapshot?.billTo.email ?? invoice.billTo?.email].filter(Boolean).join('\n')} invoiceNumber={invoice.invoiceNumber} issueDate={invoice.issueDate} dueOn={invoice.dueOn} periodStart={invoice.periodStart} periodEnd={invoice.periodEnd} currency={currency} accentColor={invoice.documentSnapshot?.branding.accentColor ?? workspace?.billingSettings?.accentColor} linePresentation={invoice.documentSnapshot?.linePresentation ?? invoice.linePresentation ?? 'detailed'} lines={(invoice.documentSnapshot?.document.displayLines ?? invoice.displayLines ?? lineItems.map((line, index) => ({ ...line, id: line.id ?? String(index), amount: line.amount ?? line.quantity * line.rate })))} subtotal={safeNumber(invoice.subtotalFees) + safeNumber(invoice.subtotalExpenses)} discount={safeNumber(invoice.discountAmount)} tax={safeNumber(invoice.taxAmount)} taxLabel={invoice.taxLabel} total={safeNumber(invoice.total ?? invoice.amount)} notes={invoice.notes} paymentInstructions={invoice.documentSnapshot?.paymentInstructions ?? invoice.paymentInstructions} footer={invoice.documentSnapshot?.footer ?? invoice.footer} /><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Delivery history</h2><div className="mt-2 space-y-2">{(invoice.deliveryHistory ?? []).map((entry) => <div className="flex items-start justify-between gap-3 text-sm" key={entry.id}><span>{entry.method} to {entry.recipient || 'recorded manually'}{entry.error ? <span className="block text-xs text-destructive">{entry.error}</span> : null}</span><Badge variant="outline">{entry.status}</Badge></div>)}{!invoice.deliveryHistory?.length ? <p className="text-sm">Not delivered.</p> : null}</div></div><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Audit history</h2><div className="mt-2 space-y-2">{audit.sort((a, b) => b.at.localeCompare(a.at)).map((entry) => <div className="flex justify-between text-sm" key={entry.id}><span>{entry.action.replace(/_/g, ' ')}</span><span className="font-mono text-xs">{entry.at.slice(0, 19).replace('T', ' ')}</span></div>)}{audit.length === 0 && <p className="text-sm">No billing events.</p>}</div></div></main><aside className="space-y-4"><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Balance</h2><p className="mt-2 font-mono text-2xl">{formatMoney(safeNumber(invoice.amountOutstanding ?? invoice.amount), currency)}</p><p className="text-sm">{age} days old · {new Date(invoice.dueOn) < new Date() && safeNumber(invoice.amountOutstanding) > 0 ? 'past due' : 'current'}</p></div><div className="rounded-lg border border-border bg-card text-card-foreground p-4"><h2 className="font-medium">Payments</h2><div className="mt-2 space-y-3">{activePayments.map((payment) => <div className="text-sm" key={payment.id}><div className="flex justify-between"><span>{payment.method.replace(/_/g, ' ')}</span><span className="font-mono">{formatMoney(payment.amount, payment.currency)}</span></div><p className="text-xs">{payment.paidAt} {reversedIds.has(payment.id) ? '· reversed' : ''}</p>{canPay && !reversedIds.has(payment.id) && <Button className="mt-1 h-7" size="sm" variant="ghost" onClick={() => { const reason = window.prompt('Payment reversal reason'); if (reason) void reverseInvoicePayment(payment.id, workspaceId, reason) }}>Reverse</Button>}</div>)}</div></div>{!stripeAvailable && canBill ? <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">Connect Stripe to create client payment links.</p> : null}</aside></div>
    {paymentOpen && <RecordPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} invoice={invoice} />}
    {sendAction && workspace ? <InvoiceSendDialog open invoice={invoice} workspace={workspace} action={sendAction} onOpenChange={(open) => { if (!open) setSendAction(null) }} onSend={async (payload) => { const ok = await act(sendAction, payload); if (!ok) throw new Error('Invoice delivery could not be queued.') }} /> : null}
  </div>
}

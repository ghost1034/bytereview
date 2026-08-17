import { tasklyticApiFetch, tasklyticApiJson } from '../tasklyticApi'
import { getRepository } from '../repository'
import {
  useBillingAuditRecordsStore,
  useBillingLocksStore,
  useClientsStore,
  useExpensesStore,
  useFxQuotesStore,
  useInvoicesStore,
  usePaymentsStore,
  useTimeEntriesStore,
  useTrustTransactionsStore,
} from '../../stores/entities'
import type { FxQuote, Invoice, Payment, TrustTransaction } from '../../types'

type InvoiceResult = { invoice: Invoice }
type PaymentResult = { invoice: Invoice; payment: Payment; trustTransaction?: TrustTransaction }

const headers = () => ({ 'Idempotency-Key': crypto.randomUUID() })

async function refreshBilling(
  workspaceId: string,
  options: { sources?: boolean; payments?: boolean; trust?: boolean; fx?: boolean } = {},
) {
  await getRepository().refreshSnapshot?.(workspaceId)
  await Promise.all([
    useInvoicesStore.getState().hydrate(),
    useBillingAuditRecordsStore.getState().hydrate(),
    useBillingLocksStore.getState().hydrate(),
    options.sources ? useTimeEntriesStore.getState().hydrate() : Promise.resolve(),
    options.sources ? useExpensesStore.getState().hydrate() : Promise.resolve(),
    options.payments ? usePaymentsStore.getState().hydrate() : Promise.resolve(),
    options.trust ? useTrustTransactionsStore.getState().hydrate() : Promise.resolve(),
    options.trust ? useClientsStore.getState().hydrate() : Promise.resolve(),
    options.fx ? useFxQuotesStore.getState().hydrate() : Promise.resolve(),
  ])
}

export async function generateInvoice(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<Invoice> {
  const result = await tasklyticApiJson<InvoiceResult>('/billing/invoices:generate', {
    method: 'POST', headers: headers(), body: JSON.stringify({ workspaceId, ...payload }),
  })
  await refreshBilling(workspaceId, { sources: true })
  return result.invoice
}

export async function runInvoiceAction(
  invoiceId: string,
  action: 'edit' | 'submit' | 'approve' | 'send' | 'resend' | 'void' | 'write-off',
  workspaceId: string,
  payload: Record<string, unknown> = {},
): Promise<Invoice> {
  const result = await tasklyticApiJson<InvoiceResult>(`/billing/invoices/${invoiceId}:${action}`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ workspaceId, ...payload }),
  })
  await refreshBilling(workspaceId, { sources: action === 'void' })
  return result.invoice
}

export async function applyInvoicePayment(
  invoiceId: string,
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<PaymentResult> {
  const result = await tasklyticApiJson<PaymentResult>(`/billing/invoices/${invoiceId}:payment`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ workspaceId, ...payload }),
  })
  await refreshBilling(workspaceId, { payments: true, trust: payload.method === 'trust_application' })
  return result
}

export async function reverseInvoicePayment(
  paymentId: string,
  workspaceId: string,
  reason: string,
): Promise<void> {
  await tasklyticApiJson(`/billing/payments/${paymentId}:reverse`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ workspaceId, reason }),
  })
  await refreshBilling(workspaceId, { payments: true, trust: true })
}

export async function recordTrustTransaction(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<TrustTransaction> {
  const result = await tasklyticApiJson<{ transaction: TrustTransaction }>('/billing/trust:record', {
    method: 'POST', headers: headers(), body: JSON.stringify({ workspaceId, ...payload }),
  })
  await refreshBilling(workspaceId, { trust: true })
  return result.transaction
}

export async function reverseTrustTransaction(
  transactionId: string,
  workspaceId: string,
  reason: string,
): Promise<void> {
  await tasklyticApiJson(`/billing/trust/${transactionId}:reverse`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ workspaceId, reason }),
  })
  await refreshBilling(workspaceId, { trust: true })
}

export async function createFxQuote(
  workspaceId: string,
  payload: Record<string, unknown>,
): Promise<FxQuote> {
  const result = await tasklyticApiJson<{ quote: FxQuote }>('/billing/fx:quote', {
    method: 'POST', headers: headers(), body: JSON.stringify({ workspaceId, ...payload }),
  })
  await refreshBilling(workspaceId, { fx: true })
  return result.quote
}

export async function downloadInvoicePdf(invoice: Invoice): Promise<void> {
  const response = await tasklyticApiFetch(`/billing/invoices/${invoice.id}/pdf?workspace_id=${encodeURIComponent(invoice.workspaceId)}`, {
    headers: { Accept: 'application/pdf' },
  })
  if (!response.ok) throw new Error(`Invoice PDF failed: ${response.status}`)
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${invoice.invoiceNumber}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function createClientInvoicePaymentLink(invoice: Invoice): Promise<string> {
  const result = await tasklyticApiJson<{ url: string }>(`/billing/invoices/${invoice.id}:payment-link`, {
    method: 'POST',
    body: JSON.stringify({
      workspaceId: invoice.workspaceId,
      successUrl: `${window.location.origin}/dashboard/project-management?payment=success`,
      cancelUrl: window.location.href,
    }),
  })
  return result.url
}

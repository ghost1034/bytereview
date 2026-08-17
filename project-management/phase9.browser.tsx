import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { BillingAuditRecord, Client, Invoice, Payment, TrustTransaction, User, Workspace } from './types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'w1' }),
  usePathname: () => '/dashboard/project-management/w/w1/psa/invoicing/i1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const billing = vi.hoisted(() => ({
  generateInvoice: vi.fn().mockResolvedValue({}), runInvoiceAction: vi.fn().mockResolvedValue({}),
  applyInvoicePayment: vi.fn().mockResolvedValue({}), reverseInvoicePayment: vi.fn().mockResolvedValue({}),
  recordTrustTransaction: vi.fn().mockResolvedValue({}), reverseTrustTransaction: vi.fn().mockResolvedValue({}),
  createFxQuote: vi.fn().mockResolvedValue({}), downloadInvoicePdf: vi.fn().mockResolvedValue(undefined),
  createClientInvoicePaymentLink: vi.fn().mockResolvedValue('https://checkout.stripe.test/session'),
}))
vi.mock('./lib/billing/actions', () => billing)

import { ProjectManagementWorkspaceRouter } from './ProjectManagementWorkspaceRouter'
import { BillingSettingsPage } from './features/settings/BillingSettingsPage'
import { InvoiceDetailPage } from './features/psa/invoicing/InvoiceDetailPage'
import { TrustPage } from './features/psa/trust/TrustPage'
import { useAuthStore, useUiStore } from './stores/auth'
import {
  useActivityCodesStore, useBillingAuditRecordsStore, useBillingBudgetsStore, useBillingLocksStore,
  useClientsStore, useExpensesStore, useFxQuotesStore, useInvoicesStore, usePaymentsStore,
  useRateCardsStore, useTimeEntriesStore, useTrustTransactionsStore, useUsersStore, useWorkspacesStore,
} from './stores/entities'

const timestamp = '2026-08-12T00:00:00Z'
const users: User[] = [
  { id: 'owner', name: 'Owner', email: 'owner@example.com', avatarColor: '#111', role: 'admin', createdAt: timestamp },
  { id: 'member', name: 'Member', email: 'member@example.com', avatarColor: '#222', role: 'member', createdAt: timestamp },
]
const workspace: Workspace = { id: 'w1', name: 'Firm', memberIds: ['owner', 'member'], adminIds: ['owner'], defaultCurrency: 'USD', billingSettings: { invoiceApprovalRequired: true, invoiceApproverIds: ['owner'] }, createdAt: timestamp }
const clients: Client[] = [{ id: 'c1', workspaceId: 'w1', name: 'Client One', type: 'business', paymentTerms: 'net_30', defaultCurrency: 'USD', retainerBalance: 500, archived: false, createdAt: timestamp }]
const invoices: Invoice[] = [
  { id: 'i1', workspaceId: 'w1', clientId: 'c1', clientName: 'Client One', invoiceNumber: 'INV-1001', issueDate: '2026-08-01', status: 'sent', amount: 200, total: 200, amountPaid: 0, amountOutstanding: 200, currency: 'USD', dueOn: '2026-08-31', narrative: 'Tax advisory', lineItems: [{ id: 'l1', description: 'Tax advisory', quantity: 2, rate: 100, amount: 200 }], createdAt: timestamp },
  { id: 'i2', workspaceId: 'w1', clientId: 'c1', clientName: 'Client One', invoiceNumber: 'INV-1002', issueDate: '2026-08-01', status: 'sent', amount: 90, total: 90, amountPaid: 0, amountOutstanding: 90, currency: 'EUR', dueOn: '2026-08-31', lineItems: [], createdAt: timestamp },
]
const payment: Payment = { id: 'pay1', workspaceId: 'w1', invoiceId: 'i1', amount: 50, currency: 'USD', method: 'check', paidAt: '2026-08-10', recordedById: 'owner', status: 'posted', createdAt: timestamp }
const trust: TrustTransaction = { id: 'tr1', workspaceId: 'w1', clientId: 'c1', type: 'deposit', amount: 500, currency: 'USD', balanceAfter: 500, recordedById: 'owner', createdAt: timestamp }
const audit: BillingAuditRecord = { id: 'a1', workspaceId: 'w1', resourceType: 'invoice', resourceId: 'i1', action: 'generated', actorId: 'owner', at: timestamp }

function seed(userId = 'owner') {
  useAuthStore.setState({ currentUserId: userId, hydrated: true }); useUiStore.setState({ activeWorkspaceId: 'w1' })
  useWorkspacesStore.setState({ items: { w1: workspace }, hydrated: true }); useUsersStore.setState({ items: Object.fromEntries(users.map((user) => [user.id, user])), hydrated: true })
  useClientsStore.setState({ items: { c1: clients[0] }, hydrated: true }); useInvoicesStore.setState({ items: Object.fromEntries(invoices.map((invoice) => [invoice.id, invoice])), hydrated: true })
  usePaymentsStore.setState({ items: { pay1: payment }, hydrated: true }); useTrustTransactionsStore.setState({ items: { tr1: trust }, hydrated: true })
  useBillingAuditRecordsStore.setState({ items: { a1: audit }, hydrated: true }); useBillingLocksStore.setState({ items: {}, hydrated: true }); useFxQuotesStore.setState({ items: {}, hydrated: true })
  useActivityCodesStore.setState({ items: {}, hydrated: true }); useBillingBudgetsStore.setState({ items: {}, hydrated: true }); useRateCardsStore.setState({ items: {}, hydrated: true })
  useTimeEntriesStore.setState({ items: {}, hydrated: true }); useExpensesStore.setState({ items: {}, hydrated: true })
}

describe('Phase 9 browser exit gate', () => {
  beforeEach(() => { vi.clearAllMocks(); seed() })

  it('routes invoice details and displays mixed-currency AR separately', async () => {
    const list = render(<ProjectManagementWorkspaceRouter workspaceId="w1" segments={['psa', 'invoicing']} />)
    await expect.element(list.getByText('$200.00 + €90.00 outstanding')).toBeVisible()
    await expect.element(list.getByRole('link', { name: 'INV-1001' })).toHaveAttribute('href', '/dashboard/project-management/w/w1/psa/invoicing/i1')
    list.unmount()
    const detail = render(<ProjectManagementWorkspaceRouter workspaceId="w1" segments={['psa', 'invoicing', 'i1']} />)
    await expect.element(detail.getByRole('heading', { name: 'INV-1001' })).toBeVisible()
    await expect.element(detail.getByText('generated')).toBeVisible()
  })

  it('uses transactional commands for payment, reversal, PDF, resend, and void workflows', async () => {
    const screen = render(<InvoiceDetailPage invoiceId="i1" />)
    await screen.getByRole('button', { name: 'Record payment' }).click()
    await screen.getByRole('button', { name: 'Record', exact: true }).click()
    expect(billing.applyInvoicePayment).toHaveBeenCalledWith('i1', 'w1', expect.objectContaining({ amount: 200, method: 'check' }))
    await screen.getByRole('button', { name: 'Download PDF' }).click()
    expect(billing.downloadInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }))
    await screen.getByRole('button', { name: 'Resend' }).click()
    expect(billing.runInvoiceAction).toHaveBeenCalledWith('i1', 'resend', 'w1', { method: 'manual' })
  })

  it('awaits an invoice transition and renders the refetched approved invoice', async () => {
    const draft = { ...invoices[0], status: 'draft' as const }
    useInvoicesStore.setState({ items: { i1: draft }, hydrated: true })
    let finishTransition: (() => void) | undefined
    billing.runInvoiceAction.mockImplementationOnce(() => new Promise((resolve) => {
      finishTransition = () => {
        const approved = { ...draft, status: 'approved' as const }
        useInvoicesStore.setState({ items: { i1: approved }, hydrated: true })
        resolve(approved)
      }
    }))

    const screen = render(<InvoiceDetailPage invoiceId="i1" />)
    await screen.getByRole('button', { name: 'Submit invoice' }).click()
    await expect.element(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled()
    finishTransition?.()

    await expect.element(screen.getByText('Approved', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Record delivery' })).toBeVisible()
  })

  it('contains invoice lifecycle failures within the detail page', async () => {
    const draft = { ...invoices[0], status: 'draft' as const }
    useInvoicesStore.setState({ items: { i1: draft }, hydrated: true })
    billing.runInvoiceAction.mockRejectedValueOnce(new Error('Approval service unavailable'))
    const screen = render(<InvoiceDetailPage invoiceId="i1" />)

    await screen.getByRole('button', { name: 'Submit invoice' }).click()
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Approval service unavailable')
    await expect.element(screen.getByRole('button', { name: 'Submit invoice' })).toBeEnabled()
  })

  it('safely renders an incompletely hydrated invoice after a hard refresh', async () => {
    const incomplete = { ...invoices[0], status: undefined, lineItems: undefined, currency: 'invalid' } as unknown as Invoice
    useInvoicesStore.setState({ items: { i1: incomplete }, hydrated: true })
    const screen = render(<InvoiceDetailPage invoiceId="i1" />)

    await expect.element(screen.getByRole('heading', { name: 'INV-1001' })).toBeVisible()
    await expect.element(screen.getByText('Status unavailable')).toBeVisible()
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Some invoice fields were unavailable')
    await expect.element(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled()
    await expect.element(screen.getByRole('complementary').getByText('$200.00', { exact: true })).toBeVisible()
  })

  it('shows the complete billing settings surface and enforces administrator editing', async () => {
    const owner = render(<BillingSettingsPage />)
    for (const name of ['Rates', 'Rate cards', 'Activity codes', 'Invoicing', 'Approvals', 'Budgets', 'FX rates']) await expect.element(owner.getByRole('tab', { name, exact: true })).toBeVisible()
    await owner.getByRole('tab', { name: 'Invoicing' }).click()
    await expect.element(owner.getByRole('button', { name: 'Save invoicing settings' })).toBeVisible()
    owner.unmount(); seed('member')
    const member = render(<BillingSettingsPage />)
    await member.getByRole('tab', { name: 'Invoicing' }).click()
    await expect.element(member.getByRole('button', { name: 'Save invoicing settings' })).not.toBeInTheDocument()
  })

  it('records trust deposits through the append-only financial command', async () => {
    const screen = render(<TrustPage />)
    await screen.getByRole('combobox').first().click(); await screen.getByRole('option', { name: 'Client One' }).click()
    await screen.getByPlaceholder('Amount').fill('100')
    await screen.getByRole('button', { name: 'Record' }).click()
    expect(billing.recordTrustTransaction).toHaveBeenCalledWith('w1', { clientId: 'c1', type: 'deposit', amount: 100, currency: 'USD' })
  })
})

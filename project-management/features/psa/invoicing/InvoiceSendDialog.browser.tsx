import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Invoice, Workspace } from '../../../types'

const api = vi.hoisted(() => ({ tasklyticApiJson: vi.fn() }))
vi.mock('../../../lib/tasklyticApi', () => api)

import { InvoiceSendDialog } from './InvoiceSendDialog'

const workspace: Workspace = {
  id: 'w1', name: 'Müller Advisory', memberIds: ['owner'], adminIds: ['owner'],
  billingSettings: {
    emailSubjectTemplate: 'Invoice {invoiceNumber} from {issuerName}',
    emailMessageTemplate: 'Please pay {amountDue}.',
  },
  createdAt: '2026-08-17T00:00:00Z',
}
const invoice: Invoice = {
  id: 'i1', workspaceId: 'w1', clientId: 'c1', clientName: 'Client', invoiceNumber: 'INV-1001',
  status: 'approved', amount: 200, total: 200, amountOutstanding: 200, currency: 'USD',
  dueOn: '2026-09-16', lineItems: [], createdAt: '2026-08-17T00:00:00Z',
  documentSnapshot: {
    version: 1, issuer: { issuerDisplayName: 'Müller Advisory' },
    billTo: { name: 'Client', email: 'billing@client.test' },
    branding: { accentColor: '#2563EB' }, pageSize: 'letter', linePresentation: 'summary',
    taxLabel: 'Tax', document: { displayLines: [] },
    freeze: { frozenAt: '2026-08-17T00:00:00Z', frozenById: 'owner' },
  },
}

describe('InvoiceSendDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('defaults from the frozen client and workspace template and offers an active payment link', async () => {
    api.tasklyticApiJson.mockResolvedValue({ capabilities: [{ provider: 'stripe_connect', available: true }] })
    const onSend = vi.fn().mockResolvedValue(undefined)
    const screen = render(<InvoiceSendDialog open onOpenChange={vi.fn()} invoice={invoice} workspace={workspace} action="send" onSend={onSend} />)
    await expect.element(screen.getByLabelText('Recipient')).toHaveValue('billing@client.test')
    await expect.element(screen.getByLabelText('Subject')).toHaveValue('Invoice {invoiceNumber} from {issuerName}')
    await expect.element(screen.getByText(/frozen PDF/)).toBeVisible()
    const payment = screen.getByRole('checkbox')
    await expect.element(payment).toBeVisible()
    await payment.click()
    await screen.getByRole('button', { name: 'Send invoice' }).click()
    await expect.poll(() => onSend.mock.calls.length).toBe(1)
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ recipient: 'billing@client.test', includePaymentLink: true }))
  })

  it('explains when Stripe is unavailable', async () => {
    api.tasklyticApiJson.mockResolvedValue({ capabilities: [{ provider: 'stripe_connect', available: false }] })
    const screen = render(<InvoiceSendDialog open onOpenChange={vi.fn()} invoice={invoice} workspace={workspace} action="resend" onSend={vi.fn()} />)
    await expect.element(screen.getByText(/Stripe Connect is not active/)).toBeVisible()
    await expect.element(screen.getByRole('checkbox')).not.toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Invoice, InvoiceStatus, User, Workspace } from '../../types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'w1' }),
}))

vi.mock('./invoicing/InvoiceWizard', () => ({
  InvoiceWizard: () => null,
}))

import { InvoicingPage } from './InvoicingPage'
import { useAuthStore, useUiStore } from '../../stores/auth'
import { useInvoicesStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'

const createdAt = '2026-08-17T00:00:00Z'
const user: User = {
  id: 'owner',
  name: 'Owner',
  email: 'owner@example.com',
  avatarColor: '#000',
  role: 'admin',
  createdAt,
}
const workspace: Workspace = {
  id: 'w1',
  name: 'Firm',
  memberIds: [user.id],
  adminIds: [user.id],
  defaultCurrency: 'USD',
  createdAt,
}
const statuses: Array<[InvoiceStatus, string]> = [
  ['draft', 'Draft'],
  ['pending_approval', 'Pending approval'],
  ['approved', 'Approved'],
  ['sent', 'Sent'],
  ['paid', 'Paid'],
  ['partial', 'Partial'],
  ['overdue', 'Overdue'],
  ['void', 'Void'],
  ['written_off', 'Written off'],
]

function invoice(status: InvoiceStatus, index: number): Invoice {
  return {
    id: `invoice-${index}`,
    workspaceId: workspace.id,
    clientName: `Client ${index}`,
    invoiceNumber: `INV-${index}`,
    status,
    amount: 100,
    amountOutstanding: 0,
    currency: 'USD',
    dueOn: '2026-08-31',
    lineItems: [],
    createdAt,
  }
}

function seed(invoices: Invoice[]) {
  useAuthStore.setState({ currentUserId: user.id, hydrated: true })
  useUiStore.setState({ activeWorkspaceId: workspace.id })
  useUsersStore.setState({ items: { [user.id]: user }, hydrated: true })
  useWorkspacesStore.setState({ items: { [workspace.id]: workspace }, hydrated: true })
  useInvoicesStore.setState({
    items: Object.fromEntries(invoices.map((item) => [item.id, item])),
    hydrated: true,
  })
}

describe('InvoicingPage', () => {
  beforeEach(() => seed([]))

  it('renders a friendly label for every invoice lifecycle status', async () => {
    seed(statuses.map(([status], index) => invoice(status, index)))
    const screen = render(<InvoicingPage />)

    for (const [, label] of statuses) {
      await expect.element(screen.getByText(label, { exact: true })).toBeVisible()
    }
    await expect.element(screen.getByText(/9 invoices/)).toBeVisible()
  })

  it('pluralizes zero, one, and multiple invoice counts', async () => {
    const empty = render(<InvoicingPage />)
    await expect.element(empty.getByText(/0 invoices/)).toBeVisible()
    empty.unmount()

    seed([invoice('approved', 1)])
    const singular = render(<InvoicingPage />)
    await expect.element(singular.getByText(/1 invoice$/)).toBeVisible()
    singular.unmount()

    seed([invoice('approved', 1), invoice('paid', 2)])
    const plural = render(<InvoicingPage />)
    await expect.element(plural.getByText(/2 invoices/)).toBeVisible()
  })
})

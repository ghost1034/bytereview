import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Client, Expense, TimeEntry, Workspace } from '../../../types'

const billing = vi.hoisted(() => ({
  createFxQuote: vi.fn().mockResolvedValue({ id: 'quote-1' }),
  generateInvoice: vi.fn().mockResolvedValue({}),
}))
vi.mock('../../../lib/billing/actions', () => billing)

import { useAuthStore } from '../../../stores/auth'
import {
  useClientsStore,
  useExpensesStore,
  useInvoicesStore,
  useMattersStore,
  useProjectsStore,
  useTimeEntriesStore,
  useWorkspacesStore,
} from '../../../stores/entities'
import { InvoiceWizard } from './InvoiceWizard'

const createdAt = '2026-08-17T00:00:00Z'
const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Firm',
  memberIds: ['user-1'],
  adminIds: ['user-1'],
  defaultCurrency: 'USD',
  createdAt,
}
const client: Client = {
  id: 'client-1',
  workspaceId: workspace.id,
  name: 'Client One',
  type: 'business',
  paymentTerms: 'net_30',
  defaultCurrency: 'USD',
  archived: false,
  createdAt,
}
const timeEntry: TimeEntry = {
  id: 'time-1',
  workspaceId: workspace.id,
  clientId: client.id,
  userId: 'user-1',
  description: 'Historical advisory work',
  hours: 2,
  amount: 400,
  currency: 'USD',
  date: '2026-07-31',
  billable: true,
  status: 'approved',
  createdAt,
}
const expense: Expense = {
  id: 'expense-1',
  workspaceId: workspace.id,
  clientId: client.id,
  userId: 'user-1',
  description: 'Filing fee',
  amount: 50,
  currency: 'USD',
  category: 'filing_fees',
  date: '2026-08-10',
  billable: true,
  status: 'approved',
  createdAt,
}

function seed() {
  useAuthStore.setState({ currentUserId: 'user-1', hydrated: true })
  useWorkspacesStore.setState({ items: { [workspace.id]: workspace }, hydrated: true })
  useClientsStore.setState({ items: { [client.id]: client }, hydrated: true })
  useTimeEntriesStore.setState({ items: { [timeEntry.id]: timeEntry }, hydrated: true })
  useExpensesStore.setState({ items: { [expense.id]: expense }, hydrated: true })
  useInvoicesStore.setState({ items: {}, hydrated: true })
  useMattersStore.setState({ items: {}, hydrated: true })
  useProjectsStore.setState({ items: {}, hydrated: true })
}

describe('InvoiceWizard period selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seed()
  })

  it('uses one source-derived, validated period for preview and generation', async () => {
    const screen = render(<InvoiceWizard open onOpenChange={vi.fn()} workspaceId={workspace.id} />)

    await screen.getByRole('combobox').click()
    await screen.getByRole('option', { name: client.name }).click()
    await screen.getByRole('button', { name: 'Next' }).click()
    await screen.getByRole('button', { name: 'Next' }).click()

    const start = screen.getByLabelText('Period start')
    const end = screen.getByLabelText('Period end')
    await expect.element(start).toHaveValue('2026-07-31')
    await expect.element(end).toHaveValue('2026-08-10')

    await start.fill('2026-08-11')
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Period start must be on or before period end.')
    await expect.element(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await start.fill('2026-09-01')
    await end.fill('2026-09-30')
    await expect.element(screen.getByRole('alert')).toHaveTextContent('No approved, unbilled time or expenses fall within this period.')
    await expect.element(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    await start.fill('2026-07-31')
    await end.fill('2026-08-10')
    await screen.getByRole('button', { name: 'Next' }).click()
    await expect.element(screen.getByLabelText('Include Historical advisory work')).toBeVisible()
    await expect.element(screen.getByLabelText('Include Filing fee')).toBeVisible()
    await expect.element(screen.getByText('$450.00')).toBeVisible()

    await screen.getByRole('button', { name: 'Next' }).click()
    await screen.getByRole('button', { name: 'Create invoice' }).click()
    await expect.poll(() => billing.generateInvoice.mock.calls.length).toBe(1)
    expect(billing.generateInvoice).toHaveBeenCalledWith(workspace.id, expect.objectContaining({
      periodStart: '2026-07-31',
      periodEnd: '2026-08-10',
      timeEntryIds: [timeEntry.id],
      expenseIds: [expense.id],
    }))
  })

  it('preserves the draft when the selected client is refreshed', async () => {
    const screen = render(<InvoiceWizard open onOpenChange={vi.fn()} workspaceId={workspace.id} />)

    await screen.getByRole('combobox').click()
    await screen.getByRole('option', { name: client.name }).click()
    await screen.getByRole('button', { name: 'Next' }).click()
    await screen.getByRole('button', { name: 'Next' }).click()

    const start = screen.getByLabelText('Period start')
    const end = screen.getByLabelText('Period end')
    await start.fill('2026-08-01')
    await end.fill('2026-08-31')

    useClientsStore.setState((state) => ({
      items: {
        ...state.items,
        [client.id]: { ...client, contactName: 'Updated in background' },
      },
    }))

    await expect.element(start).toHaveValue('2026-08-01')
    await expect.element(end).toHaveValue('2026-08-31')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Client, Expense, ExpenseReport, Matter, Project, User, Workspace } from './types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'w1' }),
  usePathname: () => '/dashboard/project-management/w/w1/psa/expenses/reports/r1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const actions = vi.hoisted(() => ({ runPsaAction: vi.fn().mockResolvedValue({}) }))
vi.mock('./lib/psa/actions', () => actions)

import { ExpenseReportDetailPage } from './features/psa/expenses/ExpenseReportDetailPage'
import { ApprovalsSettingsPage } from './features/settings/ApprovalsSettingsPage'
import { ProjectManagementWorkspaceRouter } from './ProjectManagementWorkspaceRouter'
import { useAuthStore, useUiStore } from './stores/auth'
import {
  useClientsStore, useExpenseReportsStore, useExpensesStore, useInvoicesStore, useMattersStore,
  useProjectsStore, useTimeEntriesStore, useUsersStore, useWorkspacesStore,
} from './stores/entities'

const timestamp = '2026-08-12T00:00:00Z'
const users: User[] = [
  { id: 'owner', name: 'Owner', email: 'owner@example.com', avatarColor: '#111', role: 'admin', createdAt: timestamp },
  { id: 'member', name: 'Member', email: 'member@example.com', avatarColor: '#222', role: 'member', createdAt: timestamp },
  { id: 'approver', name: 'Approver', email: 'approver@example.com', avatarColor: '#333', role: 'member', roleFlags: { canApprove: true }, createdAt: timestamp },
]
const workspace: Workspace = {
  id: 'w1', name: 'Accounting Co', memberIds: users.map((user) => user.id), adminIds: ['owner'],
  psaMode: 'accounting', requireTimeApproval: true, requireExpenseApproval: true, createdAt: timestamp,
}
const client: Client = { id: 'c1', workspaceId: 'w1', name: 'Client One', type: 'business', paymentTerms: 'net_30', defaultCurrency: 'USD', archived: false, createdAt: timestamp }
const project: Project = { id: 'p1', workspaceId: 'w1', name: '2026 Tax', teamId: 't1', privacy: 'public_to_workspace', ownerId: 'owner', memberIds: users.map((user) => user.id), defaultView: 'list', enabledViews: ['list'], status: null, archived: false, isTemplate: false, customFieldIds: [], sectionIds: [], color: '#111', createdAt: timestamp, modifiedAt: timestamp }
const matter: Matter = { id: 'm1', workspaceId: 'w1', projectId: 'p1', clientId: 'c1', matterNumber: 'E-1', practiceArea: 'Tax', responsibleAttorneyId: 'owner', originatingAttorneyId: 'owner', feeArrangement: 'hourly', openedAt: '2026-01-01', status: 'active', conflictStatus: 'cleared' }
const expenses: Expense[] = [1, 2].map((number) => ({ id: `e${number}`, workspaceId: 'w1', userId: 'member', description: `Expense ${number}`, amount: 10 * number, category: 'other', date: '2026-08-12', billable: true, reimbursable: true, status: 'submitted', expenseReportId: 'r1', createdAt: timestamp }))
const report: ExpenseReport = { id: 'r1', workspaceId: 'w1', userId: 'member', name: 'August expenses', expenseIds: expenses.map((expense) => expense.id), status: 'submitted', totalAmount: 30, reimbursableAmount: 30, currency: 'USD' }

function seed(userId: string) {
  useAuthStore.setState({ currentUserId: userId, hydrated: true })
  useUiStore.setState({ activeWorkspaceId: 'w1' })
  useWorkspacesStore.setState({ items: { w1: workspace }, hydrated: true })
  useUsersStore.setState({ items: Object.fromEntries(users.map((user) => [user.id, user])), hydrated: true })
  useClientsStore.setState({ items: { c1: client }, hydrated: true })
  useProjectsStore.setState({ items: { p1: project }, hydrated: true })
  useMattersStore.setState({ items: { m1: matter }, hydrated: true })
  useExpensesStore.setState({ items: Object.fromEntries(expenses.map((expense) => [expense.id, expense])), hydrated: true })
  useExpenseReportsStore.setState({ items: { r1: report }, hydrated: true })
  useTimeEntriesStore.setState({ items: {}, hydrated: true })
  useInvoicesStore.setState({ items: {}, hydrated: true })
}

describe('Phase 8 browser exit gate', () => {
  beforeEach(() => { vi.clearAllMocks(); seed('approver') })

  it('renders conditional engagement terminology and client/matter detail routes', async () => {
    const list = render(<ProjectManagementWorkspaceRouter workspaceId="w1" segments={['psa', 'engagements']} />)
    await expect.element(list.getByRole('heading', { name: 'Engagements' })).toBeVisible()
    await expect.element(list.getByRole('link', { name: '2026 Tax' })).toHaveAttribute('href', '/dashboard/project-management/w/w1/psa/engagements/m1')
    list.unmount()
    const detail = render(<ProjectManagementWorkspaceRouter workspaceId="w1" segments={['psa', 'clients', 'c1']} />)
    await expect.element(detail.getByRole('heading', { name: 'Client One' })).toBeVisible()
    await expect.element(detail.getByRole('heading', { name: 'Engagements' })).toBeVisible()
  })

  it('exposes client and engagement editing from list and detail pages', async () => {
    const clientList = render(<ProjectManagementWorkspaceRouter workspaceId="w1" segments={['psa', 'clients']} />)
    await clientList.getByRole('button', { name: 'Edit' }).click()
    await expect.element(clientList.getByRole('heading', { name: 'Edit client' })).toBeVisible()
    clientList.unmount()

    const clientDetail = render(<ProjectManagementWorkspaceRouter workspaceId="w1" segments={['psa', 'clients', 'c1']} />)
    await clientDetail.getByRole('button', { name: 'Edit client' }).click()
    await expect.element(clientDetail.getByRole('heading', { name: 'Edit client' })).toBeVisible()
    clientDetail.unmount()

    const matterList = render(<ProjectManagementWorkspaceRouter workspaceId="w1" segments={['psa', 'engagements']} />)
    await matterList.getByRole('button', { name: 'Edit' }).click()
    await expect.element(matterList.getByRole('heading', { name: 'Edit engagement' })).toBeVisible()
    matterList.unmount()

    const matterDetail = render(<ProjectManagementWorkspaceRouter workspaceId="w1" segments={['psa', 'engagements', 'm1']} />)
    await matterDetail.getByRole('button', { name: 'Edit engagement' }).click()
    await expect.element(matterDetail.getByRole('heading', { name: 'Edit engagement' })).toBeVisible()
  })

  it('shows unified approval settings as editable only to workspace administrators', async () => {
    seed('member')
    const member = render(<ApprovalsSettingsPage />)
    await expect.element(member.getByRole('heading', { name: 'Approvals' })).toBeVisible()
    await expect.element(member.getByRole('button', { name: 'Save approval settings' })).not.toBeInTheDocument()
    member.unmount()
    seed('owner')
    const owner = render(<ApprovalsSettingsPage />)
    await expect.element(owner.getByRole('button', { name: 'Save approval settings' })).toBeVisible()
  })

  it('supports item-level partial expense approval only for approvers', async () => {
    const screen = render(<ExpenseReportDetailPage reportId="r1" />)
    await screen.getByRole('checkbox').first().click()
    await screen.getByRole('textbox').fill('Expense 2 is outside policy')
    await screen.getByRole('button', { name: 'Approve selected' }).click()
    expect(actions.runPsaAction).toHaveBeenCalledWith('expenseReports', 'r1', 'partial-approve', 'w1', {
      approvedIds: ['e1'], rejectedIds: ['e2'], reason: 'Expense 2 is outside policy',
    })
    screen.unmount()
    seed('member')
    const member = render(<ExpenseReportDetailPage reportId="r1" />)
    await expect.element(member.getByRole('button', { name: 'Approve selected' })).not.toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Timesheet, User, Workspace } from '../../../types'

const actionMocks = vi.hoisted(() => ({
  runPsaAction: vi.fn(),
}))

vi.mock('../../../lib/psa/actions', () => ({
  runPsaAction: actionMocks.runPsaAction,
}))

import {
  useTimeEntriesStore,
  useTimesheetsStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../../stores/entities'
import { TimeApprovalsTab } from './TimeApprovalsTab'

const createdAt = '2026-08-17T00:00:00Z'
const approver: User = {
  id: 'approver',
  name: 'Alex Approver',
  email: 'approver@example.com',
  avatarColor: '#000',
  role: 'member',
  createdAt,
}

function seed(submitterId: string, approvalSettings: Workspace['approvalSettings'] = {}) {
  const workspace: Workspace = {
    id: 'w1',
    name: 'Firm',
    memberIds: ['approver', 'submitter'],
    adminIds: [],
    approvalSettings,
    createdAt,
  }
  const sheet: Timesheet = {
    id: 'sheet-1',
    workspaceId: workspace.id,
    userId: submitterId,
    periodStart: '2026-08-10',
    periodEnd: '2026-08-16',
    status: 'submitted',
    totalHours: 8,
    billableHours: 8,
    nonBillableHours: 0,
    totalAmount: 1_600,
    utilizationPercent: 20,
    targetHours: 40,
  }

  useWorkspacesStore.setState({ items: { [workspace.id]: workspace }, hydrated: true })
  useUsersStore.setState({ items: { [approver.id]: approver }, hydrated: true })
  useTimesheetsStore.setState({ items: { [sheet.id]: sheet }, hydrated: true })
  useTimeEntriesStore.setState({ items: {}, hydrated: true })
}

describe('TimeApprovalsTab', () => {
  beforeEach(() => {
    actionMocks.runPsaAction.mockReset()
  })

  it('explains and disables self-approval', async () => {
    seed(approver.id)
    const screen = render(<TimeApprovalsTab workspaceId="w1" approverId={approver.id} />)

    await expect.element(screen.getByText('You cannot approve your own time under this workspace policy.')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    await expect.element(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
  })

  it('explains and disables approvals routed to someone else', async () => {
    seed('submitter', { timeApproverIds: ['another-approver'] })
    const screen = render(<TimeApprovalsTab workspaceId="w1" approverId={approver.id} />)

    await expect.element(screen.getByText('This approval is routed to another approver.')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('submits only once and shows a busy state during rapid repeated clicks', async () => {
    seed('submitter', { timeApproverIds: [approver.id] })
    let resolveAction: (() => void) | undefined
    actionMocks.runPsaAction.mockImplementation(() => new Promise<void>((resolve) => {
      resolveAction = resolve
    }))
    const screen = render(<TimeApprovalsTab workspaceId="w1" approverId={approver.id} />)
    const approveButton = await screen.getByRole('button', { name: 'Approve' }).element() as HTMLButtonElement

    approveButton.click()
    approveButton.click()

    await expect.poll(() => actionMocks.runPsaAction.mock.calls.length).toBe(1)
    await expect.element(screen.getByRole('button', { name: 'Approving…' })).toBeDisabled()

    resolveAction?.()
    await expect.element(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })
})

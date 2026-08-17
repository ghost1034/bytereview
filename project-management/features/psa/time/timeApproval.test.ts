import { describe, expect, it, vi } from 'vitest'
import type { Workspace } from '../../../types'
import { getTimeApprovalEligibility, runApprovalOnce } from './timeApproval'

const workspace = (approvalSettings: Workspace['approvalSettings'] = {}): Workspace => ({
  id: 'w1',
  name: 'CPA Automation',
  memberIds: ['submitter', 'approver', 'other'],
  adminIds: ['admin'],
  approvalSettings,
  createdAt: '2026-08-17T00:00:00Z',
})

describe('time approval eligibility', () => {
  it('disables self-approval when workspace policy does not allow it', () => {
    expect(getTimeApprovalEligibility('approver', 'approver', workspace())).toEqual({
      eligible: false,
      reason: 'You cannot approve your own time under this workspace policy.',
    })
  })

  it('allows only routed time approvers, with an admin override', () => {
    const routedWorkspace = workspace({ timeApproverIds: ['approver'] })

    expect(getTimeApprovalEligibility('submitter', 'approver', routedWorkspace).eligible).toBe(true)
    expect(getTimeApprovalEligibility('submitter', 'other', routedWorkspace)).toEqual({
      eligible: false,
      reason: 'This approval is routed to another approver.',
    })
    expect(getTimeApprovalEligibility('submitter', 'admin', routedWorkspace).eligible).toBe(true)
  })
})

describe('time approval action guard', () => {
  it('ignores rapid repeated actions until the first request finishes', async () => {
    const inFlight = new Set<string>()
    let resolveRequest: (() => void) | undefined
    const action = vi.fn(() => new Promise<void>((resolve) => {
      resolveRequest = resolve
    }))

    const first = runApprovalOnce(inFlight, action)
    const repeated = runApprovalOnce(inFlight, action)

    expect(await repeated).toBe(false)
    expect(action).toHaveBeenCalledTimes(1)
    resolveRequest?.()
    expect(await first).toBe(true)
  })
})

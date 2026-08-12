import { describe, expect, it } from 'vitest'
import {
  hasCapability,
  requiredCapabilityForMutation,
} from './authorization'
import {
  TASKLYTIC_CAPABILITIES,
  type TasklyticCapabilities,
} from './repository/types'
import { workspaceCapabilitiesForUser } from './permissions'
import type { User, Workspace } from '../types'

describe('Tasklytic action authorization', () => {
  it('maps every privileged mutation to its action capability', () => {
    expect(requiredCapabilityForMutation('tasks', {})).toBe('edit')
    expect(requiredCapabilityForMutation('timesheets', { status: 'submitted' }, { status: 'draft' })).toBe('submit')
    expect(requiredCapabilityForMutation('expenseReports', { status: 'approved' }, { status: 'submitted' })).toBe('approve')
    expect(requiredCapabilityForMutation('invoices', {})).toBe('bill')
    expect(requiredCapabilityForMutation('payments', {})).toBe('payment')
    expect(requiredCapabilityForMutation('trustTransactions', {})).toBe('trust')
    expect(requiredCapabilityForMutation('billingRates', {})).toBe('rate')
    expect(requiredCapabilityForMutation('workspaces', {})).toBe('workspace-administration')
  })

  it('checks all nine shared capabilities without implicit grants', () => {
    const denied = Object.fromEntries(
      TASKLYTIC_CAPABILITIES.map((capability) => [capability, false]),
    ) as TasklyticCapabilities
    for (const capability of TASKLYTIC_CAPABILITIES) {
      expect(hasCapability(denied, capability)).toBe(false)
      expect(hasCapability({ ...denied, [capability]: true }, capability)).toBe(true)
    }
  })

  it('projects backend-equivalent capabilities from authoritative workspace membership', () => {
    const workspace = {
      id: 'w1',
      name: 'Acme',
      memberIds: ['admin', 'member'],
      adminIds: ['admin'],
      guestIds: ['guest'],
      createdAt: '2026-01-01T00:00:00Z',
    } as Workspace
    const admin = { id: 'admin', role: 'admin' } as User
    expect(Object.values(workspaceCapabilitiesForUser(admin, workspace)).every(Boolean)).toBe(true)
    const member = {
      id: 'member',
      role: 'member',
      roleFlags: {
        canApprove: true,
        canBill: true,
        canRecordPayments: true,
        canManageTrust: true,
        canManageRates: true,
      },
    } as User
    expect(workspaceCapabilitiesForUser(member, workspace)).toEqual({
      view: true,
      edit: true,
      submit: true,
      approve: true,
      bill: true,
      payment: true,
      trust: true,
      rate: true,
      'workspace-administration': false,
    })
  })
})

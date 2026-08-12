import { describe, expect, it } from 'vitest'
import { requiredCapabilityForMutation } from './lib/authorization'
import { computeChart, type ChartComputeContext } from './lib/reporting/computeChart'
import { reportingSource } from './lib/reporting/sourceRegistry'
import { matterTerminology } from './lib/psa/terminology'
import type { Chart, Expense, TimeEntry, Workspace } from './types'

const createdAt = '2026-08-12T00:00:00Z'
const baseContext: ChartComputeContext = {
  workspaceId: 'w1', tasks: [], projects: [], portfolios: [], goals: [], users: [], sections: [], tags: [], customFields: [], savedViews: [],
}

describe('Phase 8 PSA operations and approvals', () => {
  it('uses matters only for legal workspaces and engagements otherwise', () => {
    const base = { id: 'w1', name: 'Acme', memberIds: [], adminIds: [], createdAt } as Workspace
    expect(matterTerminology({ ...base, psaMode: 'legal' })).toEqual({ singular: 'Matter', plural: 'Matters', route: 'matters' })
    expect(matterTerminology({ ...base, psaMode: 'accounting' })).toEqual({ singular: 'Engagement', plural: 'Engagements', route: 'engagements' })
  })

  it('maps approval, write-off, lock, and reimbursement mutations to their capabilities', () => {
    expect(requiredCapabilityForMutation('timesheets', { status: 'partially_approved' }, { status: 'submitted' })).toBe('approve')
    expect(requiredCapabilityForMutation('timeEntries', { status: 'written_off' }, { status: 'approved' })).toBe('bill')
    expect(requiredCapabilityForMutation('timesheets', { status: 'locked' }, { status: 'approved' })).toBe('bill')
    expect(requiredCapabilityForMutation('expenseReports', { status: 'reimbursed' }, { status: 'approved' })).toBe('bill')
  })

  it('registers and computes time, expense, utilization, and WIP sources', () => {
    for (const source of ['time', 'expenses', 'utilization', 'wip'] as const) expect(reportingSource(source).id).toBe(source)
    const timeEntries: TimeEntry[] = [{
      id: 't1', workspaceId: 'w1', userId: 'u1', description: 'Work', hours: 2, date: '2026-08-12',
      billable: true, amount: 300, status: 'approved', createdAt,
    }]
    const expenses: Expense[] = [{
      id: 'e1', workspaceId: 'w1', userId: 'u1', description: 'Filing', amount: 50, totalAmount: 50,
      billableAmount: 50, category: 'filing_fees', date: '2026-08-12', billable: true, status: 'submitted', createdAt,
    }]
    const chart: Chart = { id: 'wip', title: 'WIP', type: 'number', source: 'wip', filters: [], measure: 'sum', measureField: 'amount' }
    const result = computeChart(chart, { ...baseContext, timeEntries, expenses })
    expect(result).toMatchObject({ kind: 'number', value: 350 })
  })

  it('preserves manual receipt fields as first-class expense evidence', () => {
    const expense: Expense = {
      id: 'e1', workspaceId: 'w1', userId: 'u1', description: 'Taxi', amount: 22, category: 'travel_ground',
      date: '2026-08-12', billable: true, createdAt,
      manualReceipt: { vendor: 'Taxi Co', date: '2026-08-12', subtotal: 20, tax: 2, total: 22, currency: 'USD', enteredById: 'u1', enteredAt: createdAt },
    }
    expect(expense.manualReceipt?.total).toBe(22)
  })
})

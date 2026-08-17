import { describe, expect, it } from 'vitest'
import { buildTimeEntry } from './createTimeEntry'

describe('buildTimeEntry', () => {
  it('preserves an explicit zero rate and its required reason', () => {
    const entry = buildTimeEntry({
      workspaceId: 'w1', userId: 'u1', date: '2026-08-17', hours: 2,
      description: 'Pro bono review', billable: true, matterId: 'm1',
      projectId: 'p1', clientId: 'c1', rateOverride: 0,
      rateOverrideReason: 'Approved pro bono work', billingRates: [], rateCards: [],
    })

    expect(entry).toMatchObject({
      matterId: 'm1', projectId: 'p1', clientId: 'c1', rateSnapshot: 0,
      rateSource: 'override', rateOverrideReason: 'Approved pro bono work', amount: 0,
    })
  })

  it('distinguishes a missing configured rate from an explicit override', () => {
    const entry = buildTimeEntry({
      workspaceId: 'w1', userId: 'u1', date: '2026-08-17', hours: 1,
      description: 'Unrated work', billable: true, billingRates: [], rateCards: [],
    })

    expect(entry).toMatchObject({ rateSnapshot: 0, rateSource: 'unconfigured' })
  })
})

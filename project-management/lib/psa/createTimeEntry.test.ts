import { describe, expect, it } from 'vitest'
import { buildTimeEntry } from './createTimeEntry'
import type { Client, Matter, RateCard, User } from '../../types'

const createdAt = '2026-08-17T00:00:00Z'
const user: User = {
  id: 'u1',
  name: 'Ian Stewart',
  email: 'ian@example.com',
  avatarColor: '#000000',
  role: 'admin',
  timekeeperRole: 'Senior Accountant',
  createdAt,
}
const card: RateCard = {
  id: 'card1',
  workspaceId: 'w1',
  name: 'Riverstone — Jordan Demo Rate',
  currency: 'USD',
  effectiveFrom: '2026-07-01',
  rates: [{
    id: 'rate1',
    workspaceId: 'w1',
    scope: 'role',
    role: 'Senior Accountant',
    hourlyRate: 200,
    currency: 'USD',
    effectiveFrom: '2026-07-01',
    createdAt,
  }],
}

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

  it('prices a backdated entry from the client default rate card', () => {
    const client: Client = {
      id: 'c1',
      workspaceId: 'w1',
      name: 'Riverstone Manufacturing',
      type: 'business',
      paymentTerms: 'net_30',
      defaultCurrency: 'USD',
      defaultRateCardId: card.id,
      archived: false,
      createdAt,
    }
    const entry = buildTimeEntry({
      workspaceId: 'w1', userId: user.id, user, client,
      clientId: client.id, date: '2026-07-31', hours: 2.5,
      description: 'Reconcile cash', billable: true,
      billingRates: [], rateCards: [card],
    })

    expect(entry).toMatchObject({
      rateSnapshot: 200,
      rateSource: 'client',
      currency: 'USD',
      amount: 500,
    })
  })

  it('prices a backdated entry from the engagement rate card', () => {
    const matter = {
      id: 'm1',
      workspaceId: 'w1',
      rateCardId: card.id,
    } as Matter
    const entry = buildTimeEntry({
      workspaceId: 'w1', userId: user.id, user, matter,
      matterId: matter.id, date: '2026-07-31', hours: 1.5,
      description: 'Perform July OpEx flux', billable: true,
      billingRates: [], rateCards: [card],
    })

    expect(entry).toMatchObject({
      rateSnapshot: 200,
      rateSource: 'matter',
      currency: 'USD',
      amount: 300,
    })
  })
})

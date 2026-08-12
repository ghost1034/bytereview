import { describe, expect, it, vi } from 'vitest'
import { aggregateMoney } from './lib/billing/currency'
import { arAgingByCurrency, invoiceOutstandingByCurrency, wipByCurrency } from './lib/billing/selectors'
import { resolveRate } from './lib/billing/resolveRate'
import { reportingSource } from './lib/reporting/sourceRegistry'
import type { BillingRate, Client, Expense, FxQuote, Invoice, RateCard, TimeEntry, User } from './types'

const createdAt = '2026-08-12T00:00:00Z'

describe('Phase 9 billing and financial controls', () => {
  it('resolves effective rates through the complete specificity cascade', () => {
    const user: User = { id: 'u1', name: 'Pat', email: 'p@example.com', avatarColor: '#000', role: 'member', timekeeperRole: 'Manager', defaultHourlyRate: 100, createdAt }
    const client: Client = { id: 'c1', workspaceId: 'w1', name: 'Client', type: 'business', paymentTerms: 'net_30', defaultCurrency: 'USD', defaultRateCardId: 'card1', archived: false, createdAt }
    const card: RateCard = { id: 'card1', workspaceId: 'w1', name: 'Client card', currency: 'USD', effectiveFrom: '2026-01-01', rates: [{ id: 'cr1', workspaceId: 'w1', scope: 'role', role: 'Manager', hourlyRate: 250, currency: 'USD', effectiveFrom: '2026-01-01', createdAt }] }
    const rates: BillingRate[] = [
      { id: 'old', workspaceId: 'w1', scope: 'matter', scopeId: 'm1', userId: 'u1', hourlyRate: 300, currency: 'USD', effectiveFrom: '2025-01-01', effectiveTo: '2026-01-01', createdAt },
      { id: 'current', workspaceId: 'w1', scope: 'matter', scopeId: 'm1', userId: 'u1', hourlyRate: 400, currency: 'USD', effectiveFrom: '2026-01-01', createdAt },
    ]
    expect(resolveRate({ workspaceId: 'w1', userId: 'u1', user, matterId: 'm1', matter: { id: 'm1', workspaceId: 'w1' } as never, clientId: 'c1', client, billingRates: rates, rateCards: [card], date: '2026-08-12' })).toMatchObject({ hourlyRate: 400, rateSource: 'matter' })
    expect(resolveRate({ workspaceId: 'w1', userId: 'u1', user, clientId: 'c1', client, project: { workspaceId: 'w1' } as never, billingRates: [], rateCards: [card], date: '2026-08-12' })).toMatchObject({ hourlyRate: 250, rateSource: 'client' })
  })

  it('never combines currencies without an explicit FX quote', () => {
    const quote: FxQuote = { id: 'fx1', workspaceId: 'w1', baseCurrency: 'GBP', quoteCurrency: 'USD', rate: 1.25, rateDate: '2026-08-11', source: 'ecb', createdAt }
    expect(aggregateMoney([{ amount: 100, currency: 'USD' }, { amount: 80, currency: 'GBP' }])).toEqual({ USD: 100, GBP: 80 })
    expect(aggregateMoney([{ amount: 100, currency: 'USD' }, { amount: 80, currency: 'GBP', fxQuoteId: 'fx1' }], 'USD', [quote])).toEqual({ USD: 200 })
  })

  it('separates WIP, outstanding AR, and aging buckets by currency', () => {
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))
    const time: TimeEntry[] = [{ id: 't1', workspaceId: 'w1', userId: 'u1', description: 'Work', hours: 1, date: '2026-08-01', billable: true, amount: 100, currency: 'USD', status: 'approved', createdAt }]
    const expenses: Expense[] = [{ id: 'e1', workspaceId: 'w1', userId: 'u1', description: 'Fee', amount: 50, billableAmount: 50, currency: 'EUR', category: 'other', date: '2026-08-01', billable: true, status: 'submitted', createdAt }]
    const invoices: Invoice[] = [
      { id: 'i1', workspaceId: 'w1', clientName: 'A', invoiceNumber: '1', status: 'sent', amount: 100, total: 100, amountOutstanding: 100, currency: 'USD', dueOn: '2026-08-01', lineItems: [], createdAt },
      { id: 'i2', workspaceId: 'w1', clientName: 'B', invoiceNumber: '2', status: 'sent', amount: 90, total: 90, amountOutstanding: 90, currency: 'EUR', dueOn: '2026-06-01', lineItems: [], createdAt },
    ]
    expect(wipByCurrency(time, expenses)).toEqual({ USD: 100, EUR: 50 })
    expect(invoiceOutstandingByCurrency(invoices)).toEqual({ USD: 100, EUR: 90 })
    expect(arAgingByCurrency(invoices, new Date('2026-08-12T00:00:00Z'))['1-30']).toEqual({ USD: 100 })
    expect(arAgingByCurrency(invoices, new Date('2026-08-12T00:00:00Z'))['61-90']).toEqual({ EUR: 90 })
    vi.useRealTimers()
  })

  it('registers every Phase 9 financial reporting source', () => {
    for (const source of ['invoices', 'payments', 'realization', 'effective_rate', 'ar_aging'] as const) {
      expect(reportingSource(source).id).toBe(source)
    }
  })
})

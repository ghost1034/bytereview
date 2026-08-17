import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  hydrate: vi.fn().mockResolvedValue(undefined),
  refreshSnapshot: vi.fn(),
}))

vi.mock('../tasklyticApi', () => ({
  tasklyticApiFetch: vi.fn(),
  tasklyticApiJson: mocks.apiJson,
}))

vi.mock('../repository', () => ({
  getRepository: () => ({ refreshSnapshot: mocks.refreshSnapshot }),
}))

vi.mock('../../stores/entities', () => {
  const store = { getState: () => ({ hydrate: mocks.hydrate }) }
  return {
    useBillingAuditRecordsStore: store,
    useBillingLocksStore: store,
    useClientsStore: store,
    useExpensesStore: store,
    useFxQuotesStore: store,
    useInvoicesStore: store,
    usePaymentsStore: store,
    useTimeEntriesStore: store,
    useTrustTransactionsStore: store,
  }
})

import { runInvoiceAction } from './actions'

describe('invoice billing actions', () => {
  it('waits for a fresh workspace snapshot before completing a lifecycle action', async () => {
    let releaseRefresh: (() => void) | undefined
    mocks.apiJson.mockResolvedValueOnce({ invoice: { id: 'invoice-1' } })
    mocks.refreshSnapshot.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseRefresh = resolve
    }))
    let settled = false

    const action = runInvoiceAction('invoice-1', 'submit', 'workspace-1').then((result) => {
      settled = true
      return result
    })
    await vi.waitFor(() => expect(mocks.refreshSnapshot).toHaveBeenCalledWith('workspace-1'))
    expect(settled).toBe(false)

    releaseRefresh?.()
    await expect(action).resolves.toEqual({ id: 'invoice-1' })
    expect(mocks.hydrate).toHaveBeenCalled()
  })
})

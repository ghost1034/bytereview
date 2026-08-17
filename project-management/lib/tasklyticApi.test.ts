import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({ getCurrentAuthToken: vi.fn().mockResolvedValue(null) }))

import {
  formatTasklyticApiError,
  tasklyticApiErrorDiagnostics,
  TasklyticApiError,
  tasklyticApiJson,
} from './tasklyticApi'

describe('tasklytic API errors', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('formats structured error codes and preserves diagnostic identifiers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      detail: { code: 'source_outside_invoice_period', sourceId: 'time-17' },
    }), {
      status: 422,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'request-42' },
    }))

    let caught: unknown
    try {
      await tasklyticApiJson('/billing/invoices:generate')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(TasklyticApiError)
    expect(caught).toMatchObject({
      message: 'A selected invoice source is outside the selected invoice period. Update the period or exclude the source.',
      status: 422,
      code: 'source_outside_invoice_period',
      sourceId: 'time-17',
      requestId: 'request-42',
    })
    expect(tasklyticApiErrorDiagnostics(caught)).toEqual([
      'Code: source_outside_invoice_period',
      'Source ID: time-17',
      'Request ID: request-42',
    ])
  })

  it('adds invoice source and period context to an actionable error', () => {
    const error = new TasklyticApiError(
      'fallback',
      422,
      { code: 'source_outside_invoice_period', sourceId: 'expense-8' },
    )

    expect(formatTasklyticApiError(error, {
      sourceLabel: 'Expense “Airfare”',
      sourceDate: '2026-07-31',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    })).toBe(
      'Expense “Airfare” dated 2026-07-31 is outside the selected invoice period 2026-08-01 to 2026-08-31. Update the period or exclude this source.',
    )
  })

  it('uses a structured message before falling back to the HTTP status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      detail: { code: 'custom_failure', message: 'Resolve the custom failure.' },
      request_id: 'body-request-id',
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }))

    await expect(tasklyticApiJson('/example')).rejects.toMatchObject({
      message: 'Resolve the custom failure.',
      code: 'custom_failure',
      requestId: 'body-request-id',
    })
  })
})

import { describe, expect, it, vi } from 'vitest'

import type { EsignAiFieldPlacementRun } from '@/lib/api'
import { pollAiFieldPlacementRun } from './aiFieldPlacementPolling'

const run = (status: EsignAiFieldPlacementRun['status']): EsignAiFieldPlacementRun => ({
  id: 'run-1',
  target_type: 'envelope',
  target_id: 'envelope-1',
  status,
  scope: 'all_documents',
  selected_document_ids: ['document-1'],
  base_revision: 1,
  instructions: null,
  proposals: [],
  warnings: [],
  error: null,
  page_usage: 1,
  progress: status === 'completed' ? 100 : 40,
  created_at: '2026-08-02T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
})

describe('AI field-placement polling', () => {
  it('keeps polling when consecutive responses have the same active status', async () => {
    const responses = [run('queued'), run('processing'), run('processing'), run('completed')]
    const fetchRun = vi.fn(async () => responses.shift()!)
    const onRun = vi.fn()

    await pollAiFieldPlacementRun({
      runId: 'run-1',
      signal: new AbortController().signal,
      fetchRun,
      onRun,
      wait: async () => undefined,
    })

    expect(fetchRun).toHaveBeenCalledTimes(4)
    expect(onRun.mock.calls.map(([latest]) => latest.status)).toEqual([
      'queued', 'processing', 'processing', 'completed',
    ])
  })

  it('retries after a transient status request failure', async () => {
    const fetchRun = vi.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(run('completed'))
    const onRun = vi.fn()

    await pollAiFieldPlacementRun({
      runId: 'run-1',
      signal: new AbortController().signal,
      fetchRun,
      onRun,
      wait: async () => undefined,
    })

    expect(fetchRun).toHaveBeenCalledTimes(2)
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
  })
})

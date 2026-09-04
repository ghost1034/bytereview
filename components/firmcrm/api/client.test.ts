// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/firebase', () => ({ getCurrentAuthToken: async () => 'platform-token' }))
import { del, get, post } from './client'

afterEach(() => vi.unstubAllGlobals())
it('uses platform authentication and preserves domain error codes', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ detail: 'A signed letter is required', code: 'engagement_letter' }), { status: 400 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(post('/opportunities/1/stage', { stage_id: 7 })).rejects.toMatchObject({ status: 400, code: 'engagement_letter' })
  expect(fetcher).toHaveBeenCalledWith('/api/firmcrm/opportunities/1/stage', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer platform-token' }), cache: 'no-store' }))
})
it('handles empty responses and encoded search without standalone token storage', async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(del('/stages/5')).resolves.toBeUndefined()
  await get('/accounts', { q: 'A & B', include_archived: false })
  expect(fetcher).toHaveBeenLastCalledWith('/api/firmcrm/accounts?q=A+%26+B&include_archived=false', expect.anything())
})

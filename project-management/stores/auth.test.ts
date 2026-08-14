import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadAll = vi.fn()
const saveAll = vi.fn()

vi.mock('../lib/repository', () => ({
  getRepository: () => ({ loadAll, saveAll }),
}))

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.resetModules()
    loadAll.mockReset()
    saveAll.mockReset()
  })

  it('does not rewrite an unchanged hydrated session during app boot', async () => {
    loadAll.mockResolvedValueOnce([{
      id: 'session',
      currentUserId: 'user-1',
      partition: 'default',
      revision: 4,
    }])
    const { useAuthStore } = await import('./auth')

    await useAuthStore.getState().hydrate()
    await useAuthStore.getState().setCurrentUser('user-1')

    expect(saveAll).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      currentUserId: 'user-1',
      partition: 'default',
    })
  })

  it('persists a changed session identity', async () => {
    loadAll.mockResolvedValueOnce([{
      id: 'session',
      currentUserId: 'user-1',
      partition: 'default',
      revision: 4,
    }])
    saveAll.mockResolvedValueOnce([])
    const { useAuthStore } = await import('./auth')

    await useAuthStore.getState().hydrate()
    await useAuthStore.getState().setCurrentUser('user-2')

    expect(saveAll).toHaveBeenCalledWith('session', [{
      currentUserId: 'user-2',
      partition: 'default',
    }])
    expect(useAuthStore.getState().currentUserId).toBe('user-2')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiJson = vi.fn()
const apiFetch = vi.fn()

vi.mock('../tasklyticApi', () => ({
  tasklyticApiJson: apiJson,
  tasklyticApiFetch: apiFetch,
}))

describe('backendRepositoryAdapter', () => {
  beforeEach(async () => {
    vi.resetModules()
    apiJson.mockReset()
    apiFetch.mockReset()
    const scope = await import('./workspaceScope')
    scope.setActiveRepositoryWorkspaceId('w1')
  })

  it('shares one bootstrap request across concurrent store hydration', async () => {
    apiJson.mockResolvedValue({
      workspaceId: 'w1',
      generatedAt: new Date().toISOString(),
      collections: { tasks: [{ id: 't1' }], projects: [{ id: 'p1' }] },
    })
    const { backendRepositoryAdapter } = await import('./backendAdapter')
    const [tasks, projects] = await Promise.all([
      backendRepositoryAdapter.loadAll<{ id: string }>('tasks'),
      backendRepositoryAdapter.loadAll<{ id: string }>('projects'),
    ])
    expect(apiJson).toHaveBeenCalledTimes(1)
    expect(tasks).toEqual([{ id: 't1' }])
    expect(projects).toEqual([{ id: 'p1' }])
  })

  it('does not update its cache after a failed delete', async () => {
    apiJson.mockResolvedValue({
      workspaceId: 'w1', generatedAt: new Date().toISOString(), collections: { tasks: [{ id: 't1' }] },
    })
    apiFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ detail: 'denied' }) })
    const { backendRepositoryAdapter } = await import('./backendAdapter')
    await backendRepositoryAdapter.loadAll('tasks')
    await expect(backendRepositoryAdapter.removeOne('tasks', 't1')).rejects.toThrow('denied')
    expect(await backendRepositoryAdapter.loadAll('tasks')).toEqual([{ id: 't1' }])
  })
})

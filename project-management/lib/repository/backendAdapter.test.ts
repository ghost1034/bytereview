import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../../types'

const apiJson = vi.fn()

vi.mock('../tasklyticApi', () => {
  class TasklyticApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly detail?: unknown,
    ) {
      super(message)
    }
  }
  return { tasklyticApiJson: apiJson, TasklyticApiError }
})

vi.mock('../workspaceEvents', () => ({
  connectWorkspaceEventStream: vi.fn(() => vi.fn()),
}))

const allCapabilities = {
  view: true,
  edit: true,
  submit: true,
  approve: true,
  bill: true,
  payment: true,
  trust: true,
  rate: true,
  'workspace-administration': true,
}

describe('backendRepositoryAdapter', () => {
  beforeEach(async () => {
    vi.resetModules()
    apiJson.mockReset()
    const scope = await import('./workspaceScope')
    scope.setActiveRepositoryWorkspaceId('w1')
  })

  it('shares one bootstrap request and retains exposed revisions', async () => {
    apiJson.mockResolvedValue({
      workspaceId: 'w1',
      generatedAt: new Date().toISOString(),
      capabilities: allCapabilities,
      collections: {
        tasks: [{ id: 't1', revision: 3 }],
        projects: [{ id: 'p1', revision: 2 }],
      },
    })
    const { backendRepositoryAdapter } = await import('./backendAdapter')
    const [tasks, projects] = await Promise.all([
      backendRepositoryAdapter.loadAll<{ id: string; revision: number }>('tasks'),
      backendRepositoryAdapter.loadAll<{ id: string; revision: number }>('projects'),
    ])
    expect(apiJson).toHaveBeenCalledTimes(1)
    expect(tasks[0].revision).toBe(3)
    expect(projects[0].revision).toBe(2)
  })

  it('sends If-Match and caches the server revision after an update', async () => {
    apiJson
      .mockResolvedValueOnce({
        workspaceId: 'w1',
        generatedAt: new Date().toISOString(),
        capabilities: allCapabilities,
        collections: { tasks: [{ id: 't1', name: 'Before', revision: 7 }] },
      })
      .mockResolvedValueOnce({ id: 't1', name: 'After', revision: 8 })
    const { backendRepositoryAdapter } = await import('./backendAdapter')
    const [task] = await backendRepositoryAdapter.loadAll<{
      id: string
      name: string
      revision: number
    }>('tasks')
    const saved = await backendRepositoryAdapter.upsertOne('tasks', {
      ...task,
      name: 'After',
    })
    expect(apiJson).toHaveBeenLastCalledWith(
      '/tasks/t1?workspace_id=w1',
      expect.objectContaining({ headers: { 'If-Match': '"7"' } }),
    )
    expect(saved.revision).toBe(8)
  })

  it('uses the cached revision when a session save omits it', async () => {
    apiJson
      .mockResolvedValueOnce({
        workspaceId: null,
        generatedAt: new Date().toISOString(),
        capabilities: null,
        collections: {
          session: [{
            id: 'session',
            currentUserId: 'user-1',
            partition: 'default',
            revision: 4,
          }],
        },
      })
      .mockResolvedValueOnce({
        id: 'session',
        currentUserId: 'user-1',
        partition: 'default',
        revision: 5,
      })
    const { backendRepositoryAdapter } = await import('./backendAdapter')
    await backendRepositoryAdapter.loadAll('session')

    await backendRepositoryAdapter.saveAll<Session>('session', [{
      currentUserId: 'user-1',
      partition: 'default',
    }])

    expect(apiJson).toHaveBeenLastCalledWith(
      '/session/session',
      expect.objectContaining({ headers: { 'If-Match': '"4"' } }),
    )
  })

  it('reports a revision conflict without replacing the loaded record', async () => {
    const { registerConflictHandler } = await import('../concurrency')
    const conflicts: unknown[] = []
    registerConflictHandler((conflict) => conflicts.push(conflict))
    apiJson.mockResolvedValueOnce({
      workspaceId: 'w1',
      generatedAt: new Date().toISOString(),
      capabilities: allCapabilities,
      collections: { tasks: [{ id: 't1', name: 'Loaded', revision: 1 }] },
    })
    const { TasklyticApiError } = await import('../tasklyticApi')
    apiJson.mockRejectedValueOnce(new TasklyticApiError(
      'conflict',
      409,
      {
        code: 'revision_conflict',
        current: { id: 't1', name: 'Current', revision: 2 },
      },
    ))
    const { backendRepositoryAdapter } = await import('./backendAdapter')
    await backendRepositoryAdapter.loadAll('tasks')
    await expect(backendRepositoryAdapter.upsertOne('tasks', {
      id: 't1',
      name: 'Attempt',
      revision: 1,
    })).rejects.toMatchObject({ name: 'RevisionConflictError' })
    expect(conflicts).toHaveLength(1)
    expect(await backendRepositoryAdapter.loadAll('tasks')).toEqual([
      { id: 't1', name: 'Loaded', revision: 1 },
    ])
  })

  it('enforces frontend capabilities before issuing a mutation', async () => {
    apiJson.mockResolvedValueOnce({
      workspaceId: 'w1',
      generatedAt: new Date().toISOString(),
      capabilities: { ...allCapabilities, payment: false },
      collections: { payments: [{ id: 'pay1', revision: 1 }] },
    })
    const { backendRepositoryAdapter } = await import('./backendAdapter')
    await backendRepositoryAdapter.loadAll('payments')
    await expect(backendRepositoryAdapter.upsertOne('payments', {
      id: 'pay1',
      revision: 1,
    })).rejects.toMatchObject({ name: 'TasklyticForbiddenError', capability: 'payment' })
    expect(apiJson).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it, vi } from 'vitest'

import { resolveTasklyticPersistenceMode } from './runtimeMode'

vi.mock('./tasklyticApi', () => ({
  tasklyticApiJson: vi.fn(),
  tasklyticApiFetch: vi.fn(),
}))

describe('Tasklytic persistence boundary', () => {
  it('requires the backend for development and production customer use', () => {
    expect(resolveTasklyticPersistenceMode({ NODE_ENV: 'development' })).toBe('backend')
    expect(resolveTasklyticPersistenceMode({ NODE_ENV: 'production' })).toBe('backend')
  })

  it('allows local persistence only for tests and explicit evaluation tooling', () => {
    expect(resolveTasklyticPersistenceMode({ NODE_ENV: 'test' })).toBe('local-test')
    expect(
      resolveTasklyticPersistenceMode({
        NODE_ENV: 'production',
        NEXT_PUBLIC_INTERNAL_EVAL: 'true',
      }),
    ).toBe('local-evaluation')
  })

  it('ignores the removed backend rollback flag', () => {
    expect(
      resolveTasklyticPersistenceMode({
        NODE_ENV: 'production',
        NEXT_PUBLIC_TASKLYTIC_BACKEND: '0',
      } as Record<string, string>),
    ).toBe('backend')
  })

  it('binds authenticated production use to the backend adapter', async () => {
    const [{ selectTasklyticRepository }, { backendRepositoryAdapter }] = await Promise.all([
      import('./repository'),
      import('./repository/backendAdapter'),
    ])
    expect(selectTasklyticRepository('backend')).toBe(backendRepositoryAdapter)
  })

  it('binds explicitly gated evaluation tooling to the local adapter', async () => {
    const [{ selectTasklyticRepository }, { localRepositoryAdapter }] = await Promise.all([
      import('./repository'),
      import('./repository/localAdapter'),
    ])
    expect(selectTasklyticRepository('local-evaluation')).toBe(localRepositoryAdapter)
  })
})

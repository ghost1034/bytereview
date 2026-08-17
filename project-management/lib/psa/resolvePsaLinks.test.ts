import { describe, expect, it } from 'vitest'
import { resolveLinkedMatter } from './resolvePsaLinks'
import type { Matter, Project } from '../../types'

const project = { id: 'p1', workspaceId: 'w1', matterId: 'm1' } as Project
const matter = { id: 'm1', workspaceId: 'w1', projectId: 'p1', clientId: 'c1' } as Matter

describe('resolveLinkedMatter', () => {
  it('resolves a task project to its linked matter', () => {
    expect(resolveLinkedMatter([matter], project)).toBe(matter)
  })

  it('falls back to the project relationship when the project has no matter id', () => {
    expect(resolveLinkedMatter([matter], { ...project, matterId: undefined })).toBe(matter)
  })

  it('honors an explicit matter over the project link', () => {
    const explicit = { ...matter, id: 'm2', projectId: 'p2' }
    expect(resolveLinkedMatter([matter, explicit], project, 'm2')).toBe(explicit)
  })
})

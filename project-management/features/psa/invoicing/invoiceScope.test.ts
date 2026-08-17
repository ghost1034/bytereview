import { describe, expect, it } from 'vitest'
import { matchesBillingScope } from './invoiceScope'
import type { Matter } from '../../../types'

const matter: Matter = {
  id: 'matter-1',
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  clientId: 'client-1',
  matterNumber: 'ENG-2026-071',
  practiceArea: 'Advisory',
  responsibleAttorneyId: 'owner-1',
  originatingAttorneyId: 'owner-1',
  feeArrangement: 'hourly',
  openedAt: '2026-01-01',
  status: 'active',
  conflictStatus: 'cleared',
}

describe('invoice billing scope', () => {
  it('includes both directly linked and legacy project-only sources in matter scope', () => {
    const scope = `matter:${matter.id}`

    expect(matchesBillingScope({ matterId: matter.id }, scope, [matter])).toBe(true)
    expect(matchesBillingScope({ projectId: matter.projectId }, scope, [matter])).toBe(true)
  })

  it('excludes sources outside the matter and its linked project', () => {
    const scope = `matter:${matter.id}`

    expect(matchesBillingScope({ matterId: 'matter-2', projectId: 'project-2' }, scope, [matter])).toBe(false)
    expect(matchesBillingScope({ projectId: matter.projectId }, 'matter:missing', [matter])).toBe(false)
  })
})

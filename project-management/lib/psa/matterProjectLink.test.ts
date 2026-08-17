import { describe, expect, it } from 'vitest'
import {
  availableMatterProjects,
  matchingMatterProjects,
  updateForMatterLink,
} from './matterProjectLink'
import type { Matter, Project } from '../../types'

const project: Project = {
  id: 'project-existing',
  workspaceId: 'workspace-1',
  teamId: 'team-1',
  name: 'Audit 2026',
  color: 'primary',
  privacy: 'public_to_team',
  memberIds: ['owner-1'],
  ownerId: 'owner-1',
  defaultView: 'list',
  enabledViews: ['list'],
  status: 'on_track',
  archived: false,
  isTemplate: false,
  customFieldIds: [],
  sectionIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  modifiedAt: '2026-01-01T00:00:00.000Z',
}

describe('matter project linking', () => {
  it('offers only active, unlinked projects from the current workspace', () => {
    const projects = [
      project,
      { ...project, id: 'archived', archived: true },
      { ...project, id: 'linked-by-matter' },
      { ...project, id: 'linked-by-project', matterId: 'matter-2' },
      { ...project, id: 'other-workspace', workspaceId: 'workspace-2' },
    ]
    const matters = [{ projectId: 'linked-by-matter' } as Matter]

    expect(availableMatterProjects(projects, matters, 'workspace-1')).toEqual([project])
  })

  it('warns about exact project-name matches regardless of case or whitespace', () => {
    expect(matchingMatterProjects([project], '  audit 2026 ')).toEqual([project])
  })

  it('links an existing project without changing its identity', () => {
    const linked = updateForMatterLink(project, {
      clientId: 'client-1',
      matterId: 'matter-new',
      ownerId: 'owner-2',
      feeArrangement: 'hourly',
      useUtbms: true,
      trustEnabled: false,
      modifiedAt: '2026-08-17T12:00:00.000Z',
    })

    expect(linked.id).toBe(project.id)
    expect(linked.name).toBe(project.name)
    expect(linked).toMatchObject({
      matterId: 'matter-new',
      clientId: 'client-1',
      requireTimeTracking: true,
    })
  })
})

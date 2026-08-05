import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const operations: string[] = []
  const projects = new Map<string, Record<string, unknown>>()
  const sections = new Set<string>()
  let id = 0

  return {
    operations,
    projects,
    sections,
    nextId: () => `id-${++id}`,
    reset: () => {
      operations.length = 0
      projects.clear()
      sections.clear()
      id = 0
    },
  }
})

vi.mock('../activity', () => ({ emitActivity: vi.fn() }))
vi.mock('../customFields/customFieldActions', () => ({
  addFieldToProject: vi.fn(),
  createCustomField: vi.fn(),
}))
vi.mock('../customFields/seedRecommendedFields', () => ({ ensureRecommendedFields: vi.fn() }))
vi.mock('../ids', () => ({ newId: mocks.nextId }))
vi.mock('../time', () => ({ now: () => '2026-08-05T00:00:00.000Z' }))
vi.mock('./templateLibrary', () => ({
  getCuratedTemplateById: (id: string) => id === 'template-1' ? {
    id,
    name: 'Starter project',
    category: 'General',
    sectionNames: ['To do'],
    customFieldIds: [],
    taskTemplates: [{
      name: 'First task',
      defaults: {},
      subtaskTemplates: [],
    }],
  } : undefined,
  TEMPLATE_LIBRARY: [],
  TEMPLATE_CATEGORIES: [],
}))
vi.mock('./instantiateTasks', () => ({
  createTaskFromTaskTemplate: vi.fn(async (_template, context) => {
    expect(mocks.projects.has(context.projectId)).toBe(true)
    expect(mocks.sections.has(context.sectionId)).toBe(true)
    mocks.operations.push('task:add')
    context.taskOrder.push('task-1')
    return { id: 'task-1' }
  }),
}))

vi.mock('../../stores/entities', () => ({
  useProjectsStore: {
    getState: () => ({
      add: async (project: Record<string, unknown>) => {
        mocks.operations.push('project:add')
        mocks.projects.set(project.id as string, project)
      },
      update: async (id: string, patch: Record<string, unknown>) => {
        mocks.operations.push('project:update')
        mocks.projects.set(id, { ...mocks.projects.get(id), ...patch })
      },
    }),
  },
  useSectionsStore: {
    getState: () => ({
      add: async (section: Record<string, unknown>) => {
        expect(mocks.projects.has(section.projectId as string)).toBe(true)
        mocks.operations.push('section:add')
        mocks.sections.add(section.id as string)
      },
    }),
  },
  useTasksStore: { getState: () => ({}) },
  useCustomFieldsStore: { getState: () => ({ list: () => [] }) },
  useRulesStore: { getState: () => ({ add: vi.fn() }) },
  useFormsStore: { getState: () => ({ add: vi.fn() }) },
  useDashboardsStore: { getState: () => ({ add: vi.fn() }) },
}))

import { instantiateTemplate } from './instantiateTemplate'

describe('instantiateTemplate', () => {
  beforeEach(() => mocks.reset())

  it('persists the project and sections before tasks that reference them', async () => {
    const result = await instantiateTemplate('template-1', {
      workspaceId: 'workspace-1',
      teamId: 'team-1',
      ownerId: 'owner-1',
      privacy: 'public_to_team',
    })

    expect(result?.project.id).toBe('id-1')
    expect(mocks.operations).toEqual([
      'project:add',
      'section:add',
      'task:add',
      'project:update',
    ])
    expect(mocks.projects.get('id-1')?.taskOrderBySection).toEqual({
      'id-2': ['task-1'],
    })
  })
})

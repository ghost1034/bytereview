import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../types'

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  updateTask: vi.fn(),
  tasks: new Map<string, Task>(),
  sections: new Map<string, { id: string; projectId: string; name?: string }>(),
}))

vi.mock('./activity', () => ({ emitActivity: vi.fn() }))
vi.mock('./analytics', () => ({ getAnalyticsAdapter: () => ({ track: vi.fn() }) }))
vi.mock('./ids', () => ({ newId: () => 'task-1' }))
vi.mock('./notifications', () => ({ notifyTaskAssigned: vi.fn() }))
vi.mock('./time', () => ({ now: () => '2026-08-17T00:00:00.000Z' }))
vi.mock('../stores/taskUndo', () => ({ pushTaskUndo: vi.fn() }))
vi.mock('../stores/entities', () => ({
  useSectionsStore: {
    getState: () => ({ getById: (id: string) => mocks.sections.get(id) }),
  },
  useTasksStore: {
    getState: () => ({
      add: mocks.addTask,
      update: mocks.updateTask,
      getById: (id: string) => mocks.tasks.get(id),
      list: () => [],
    }),
  },
}))

import { createTask, setSectionForProject } from './taskActions'

const input = {
  workspaceId: 'workspace-1',
  name: 'Review return',
  projectId: 'project-1',
  actorId: 'user-1',
}

describe('createTask section validation', () => {
  beforeEach(() => {
    mocks.addTask.mockReset()
    mocks.updateTask.mockReset()
    mocks.tasks.clear()
    mocks.sections.clear()
  })

  it('creates a project task without a section', async () => {
    const task = await createTask(input)

    expect(task.sectionIdByProject).toEqual({})
    expect(mocks.addTask).toHaveBeenCalledOnce()
  })

  it('accepts a section that belongs to the selected project', async () => {
    mocks.sections.set('section-1', { id: 'section-1', projectId: input.projectId })

    const task = await createTask({ ...input, sectionId: 'section-1' })

    expect(task.sectionIdByProject).toEqual({ [input.projectId]: 'section-1' })
    expect(mocks.addTask).toHaveBeenCalledOnce()
  })

  it('rejects synthetic, missing, and cross-project section IDs', async () => {
    mocks.sections.set('other-section', { id: 'other-section', projectId: 'project-2' })

    await expect(createTask({ ...input, sectionId: '__none__' })).rejects.toThrow(
      'The selected section is not available in this project.',
    )
    await expect(createTask({ ...input, sectionId: 'missing-section' })).rejects.toThrow(
      'The selected section is not available in this project.',
    )
    await expect(createTask({ ...input, sectionId: 'other-section' })).rejects.toThrow(
      'The selected section is not available in this project.',
    )
    expect(mocks.addTask).not.toHaveBeenCalled()
  })
})

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    workspaceId: 'workspace-1',
    name: 'Review return',
    resourceSubtype: 'default_task',
    completed: false,
    collaboratorIds: [],
    projectIds: ['project-1'],
    sectionIdByProject: { 'project-1': 'todo' },
    tagIds: [],
    customFieldValues: {},
    dependencyIds: [],
    dependentIds: [],
    attachmentIds: [],
    likedByIds: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    modifiedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('setSectionForProject completion synchronization', () => {
  beforeEach(() => {
    mocks.updateTask.mockReset()
    mocks.tasks.clear()
    mocks.sections.clear()
    mocks.sections.set('todo', {
      id: 'todo',
      projectId: 'project-1',
      name: 'To do',
    })
    mocks.sections.set('doing', {
      id: 'doing',
      projectId: 'project-1',
      name: 'In progress',
    })
    mocks.sections.set('done', {
      id: 'done',
      projectId: 'project-1',
      name: 'Done',
    })
  })

  it('completes a task atomically when it enters Done', async () => {
    mocks.tasks.set('task-1', task())

    await setSectionForProject('task-1', 'project-1', 'done', 'user-1')

    expect(mocks.updateTask).toHaveBeenCalledOnce()
    expect(mocks.updateTask).toHaveBeenCalledWith('task-1', {
      sectionIdByProject: { 'project-1': 'done' },
      completed: true,
      completedAt: '2026-08-17T00:00:00.000Z',
      completedById: 'user-1',
      modifiedAt: '2026-08-17T00:00:00.000Z',
    })
  })

  it('reopens a task atomically when it leaves Done', async () => {
    mocks.tasks.set('task-1', task({
      completed: true,
      completedAt: '2026-08-10T00:00:00.000Z',
      completedById: 'user-2',
      sectionIdByProject: { 'project-1': 'done' },
    }))

    await setSectionForProject('task-1', 'project-1', 'todo', 'user-1')

    expect(mocks.updateTask).toHaveBeenCalledOnce()
    expect(mocks.updateTask).toHaveBeenCalledWith('task-1', {
      sectionIdByProject: { 'project-1': 'todo' },
      completed: false,
      completedAt: undefined,
      completedById: undefined,
      modifiedAt: '2026-08-17T00:00:00.000Z',
    })
  })

  it('preserves completion when moving between ordinary workflow sections', async () => {
    mocks.tasks.set('task-1', task({ completed: true }))

    await setSectionForProject('task-1', 'project-1', 'doing', 'user-1')

    expect(mocks.updateTask).toHaveBeenCalledOnce()
    expect(mocks.updateTask).toHaveBeenCalledWith('task-1', {
      sectionIdByProject: { 'project-1': 'doing' },
      modifiedAt: '2026-08-17T00:00:00.000Z',
    })
  })
})

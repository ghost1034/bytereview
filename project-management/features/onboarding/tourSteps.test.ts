import { describe, expect, it } from 'vitest'

import { buildTourSteps } from './tourSteps'

describe('buildTourSteps', () => {
  it('covers every major Tasklytic area in a stable order', () => {
    const steps = buildTourSteps({
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      taskId: 'task-1',
    })

    expect(steps.map((step) => step.id)).toEqual([
      'welcome',
      'navigation',
      'global-tools',
      'projects',
      'tasks',
      'my-tasks',
      'inbox',
      'search',
      'forms',
      'rules',
      'goals',
      'portfolios',
      'workload',
      'reporting',
      'templates',
      'ai',
      'time',
      'expenses',
      'clients-matters',
      'invoicing',
      'trust',
      'psa-reports',
      'people-admin',
      'complete',
    ])
    expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length)
    expect(steps.every((step) => step.route.startsWith('/dashboard/project-management/w/workspace-1/'))).toBe(true)
    expect(steps.find((step) => step.id === 'projects')?.route).toContain('/projects/project-1')
    expect(steps.find((step) => step.id === 'tasks')?.route).toContain('/tasks/task-1')
  })

  it('keeps the project and task chapters usable in an empty workspace', () => {
    const steps = buildTourSteps({ workspaceId: 'empty-workspace' })
    const projects = steps.find((step) => step.id === 'projects')
    const tasks = steps.find((step) => step.id === 'tasks')

    expect(projects?.route).toBe('/dashboard/project-management/w/empty-workspace/projects')
    expect(tasks?.route).toBe(projects?.route)
    expect(tasks?.target).toBe('[data-tour-page="projects"]')
  })
})

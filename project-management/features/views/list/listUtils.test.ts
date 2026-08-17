import { describe, expect, it } from 'vitest'
import type { Project, Task } from '../../../types'
import { buildListRows } from './listUtils'

const project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  sectionIds: ['section-1'],
} as Project

const task = {
  id: 'task-1',
  name: 'Unsectioned task',
  projectIds: [project.id],
  sectionIdByProject: {},
} as Task

describe('buildListRows', () => {
  it('does not use the synthetic No section group key as a section ID', () => {
    const rows = buildListRows({
      groups: [{ key: '__none__', label: 'No section', tasks: [task] }],
      sections: [{ id: 'section-1', projectId: project.id, name: 'To do', order: 0, collapsed: false }],
      groupBySection: true,
      collapsedIds: new Set(),
      expandedTaskIds: new Set(),
      project,
      allTasks: [task],
      getChildren: () => [],
    })

    expect(rows.find((row) => row.kind === 'add-task')).toEqual({
      kind: 'add-task',
      groupKey: '__none__',
      sectionId: undefined,
    })
  })
})

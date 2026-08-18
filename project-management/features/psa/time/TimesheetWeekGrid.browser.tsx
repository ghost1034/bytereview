import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import '@/app/globals.css'
import type { Task, TimeEntry } from '../../../types'
import { TimesheetWeekGrid } from './TimesheetWeekGrid'

const createdAt = '2026-08-17T00:00:00Z'
const task: Task = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Prepare return',
  resourceSubtype: 'default_task',
  completed: false,
  collaboratorIds: [],
  projectIds: ['project-1'],
  sectionIdByProject: {},
  tagIds: [],
  customFieldValues: {},
  dependencyIds: [],
  dependentIds: [],
  attachmentIds: [],
  likedByIds: [],
  createdAt,
  modifiedAt: createdAt,
}
const entry: TimeEntry = {
  id: 'entry-1',
  workspaceId: 'workspace-1',
  userId: 'user-1',
  projectId: 'project-1',
  taskId: task.id,
  description: 'Tax preparation',
  hours: 2,
  date: '2026-08-17',
  billable: true,
  createdAt,
}

describe('TimesheetWeekGrid', () => {
  it('centers time fields under their date headings', async () => {
    const screen = render(
      <TimesheetWeekGrid
        entries={[entry]}
        tasks={[task]}
        weekAnchor={new Date(2026, 7, 17)}
        onCellSave={() => undefined}
      />
    )

    const dateHeading = await screen.getByText('08-17').element()
    const table = dateHeading.closest('table')
    const firstField = table?.querySelector('tbody input')
    const dailyTotal = table?.querySelector('tfoot td:nth-child(2)')
    expect(firstField).toBeInstanceOf(HTMLInputElement)
    expect(dailyTotal).toBeInstanceOf(HTMLTableCellElement)
    const headingBounds = dateHeading.getBoundingClientRect()
    const fieldBounds = (firstField as HTMLInputElement).getBoundingClientRect()
    const totalBounds = (dailyTotal as HTMLTableCellElement).getBoundingClientRect()
    const fieldCenter = fieldBounds.left + fieldBounds.width / 2

    expect(fieldCenter).toBeCloseTo(headingBounds.left + headingBounds.width / 2, 0)
    expect(fieldCenter).toBeCloseTo(totalBounds.left + totalBounds.width / 2, 0)
  })
})

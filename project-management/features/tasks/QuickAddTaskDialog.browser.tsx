import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Task } from '../../types'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/project-management',
  useRouter: () => ({ push: vi.fn() }),
}))

const taskActionMocks = vi.hoisted(() => ({
  createTask: vi.fn(),
}))

vi.mock('../../lib/taskActions', () => ({
  createTask: taskActionMocks.createTask,
}))

import { useAuthStore } from '../../stores/auth'
import {
  useProjectsStore,
  useSectionsStore,
  useUsersStore,
  useWorkspacesStore,
} from '../../stores/entities'
import { QuickAddTaskDialog } from './QuickAddTaskDialog'

const task: Task = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  name: 'Prepare return',
  resourceSubtype: 'default_task',
  completed: false,
  collaboratorIds: [],
  projectIds: [],
  sectionIdByProject: {},
  tagIds: [],
  customFieldValues: {},
  dependencyIds: [],
  dependentIds: [],
  attachmentIds: [],
  likedByIds: [],
  createdAt: '2026-08-17T12:00:00.000Z',
  modifiedAt: '2026-08-17T12:00:00.000Z',
}

describe('QuickAddTaskDialog', () => {
  beforeEach(() => {
    taskActionMocks.createTask.mockReset()
    useAuthStore.setState({ currentUserId: 'user-1', hydrated: true })
    useProjectsStore.setState({ items: {}, hydrated: true })
    useSectionsStore.setState({ items: {}, hydrated: true })
    useUsersStore.setState({ items: {}, hydrated: true })
    useWorkspacesStore.setState({ items: {}, hydrated: true })
  })

  it('creates only one task when Enter and click are submitted while creation is pending', async () => {
    let resolveCreate: (createdTask: Task) => void = () => undefined
    taskActionMocks.createTask.mockImplementation(() => new Promise<Task>((resolve) => {
      resolveCreate = resolve
    }))

    const screen = render(
      <QuickAddTaskDialog
        open
        onOpenChange={vi.fn()}
        workspaceId="workspace-1"
      />
    )
    const nameInput = screen.getByLabelText('Task name')
    await nameInput.fill(task.name)

    const inputElement = await nameInput.element()
    const buttonElement = (await screen.getByRole('button', { name: 'Add task' }).element()) as HTMLButtonElement
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    buttonElement.click()

    await expect.poll(() => taskActionMocks.createTask.mock.calls.length).toBe(1)
    await expect.element(screen.getByRole('button', { name: 'Adding task…' })).toBeDisabled()
    await expect.element(nameInput).toBeDisabled()

    resolveCreate(task)
    await expect.element(screen.getByRole('button', { name: 'Add task' })).toBeDisabled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Chart, Dashboard, Task, Team, User, Workspace } from './types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'w1' }),
  usePathname: () => '/dashboard/project-management/w/w1/reporting/d1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signOut: vi.fn(), user: { uid: 'viewer' }, loading: false }) }))

import { DashboardPage } from './features/reporting/DashboardPage'
import { DrillDownPanel } from './features/reporting/DrillDownPanel'
import { useAuthStore, useUiStore } from './stores/auth'
import {
  useCustomFieldsStore, useDashboardsStore, useGoalsStore, usePortfoliosStore, useProjectsStore,
  useSavedViewsStore, useSectionsStore, useTagsStore, useTasksStore, useTeamsStore, useUsersStore,
  useWorkspacesStore,
} from './stores/entities'

const timestamp = '2026-08-12T00:00:00.000Z'
const users: User[] = [
  { id: 'owner', name: 'Owner', email: 'owner@example.com', avatarColor: '#111', role: 'admin', createdAt: timestamp },
  { id: 'editor', name: 'Editor', email: 'editor@example.com', avatarColor: '#222', role: 'member', createdAt: timestamp },
  { id: 'viewer', name: 'Viewer', email: 'viewer@example.com', avatarColor: '#333', role: 'member', createdAt: timestamp },
]
const workspace: Workspace = { id: 'w1', name: 'Acme', memberIds: users.map((user) => user.id), adminIds: ['owner'], createdAt: timestamp }
const team: Team = { id: 'team1', workspaceId: 'w1', name: 'General', memberIds: users.map((user) => user.id), adminIds: ['owner'], privacy: 'public' }
const task: Task = {
  id: 'task1', workspaceId: 'w1', name: 'Accessible task', resourceSubtype: 'default_task', completed: false,
  collaboratorIds: [], projectIds: [], sectionIdByProject: {}, tagIds: [], customFieldValues: {}, dependencyIds: [],
  dependentIds: [], attachmentIds: [], likedByIds: [], createdAt: timestamp, modifiedAt: timestamp,
}
const dashboard: Dashboard = {
  id: 'd1', workspaceId: 'w1', name: 'Operations', ownerId: 'owner', charts: [], layout: [],
  sharedWith: ['editor'], editorIds: ['editor'], viewerIds: ['viewer'], visibility: 'people', createdAt: timestamp,
}
const chart: Chart = { id: 'c1', title: 'Tasks', type: 'bar', source: 'tasks', filters: [], xAxis: 'completed', measure: 'count' }

function seed(userId = 'viewer') {
  useAuthStore.setState({ currentUserId: userId, hydrated: true })
  useUiStore.setState({ activeWorkspaceId: 'w1', sidebarCollapsed: false })
  useWorkspacesStore.setState({ items: { w1: workspace }, hydrated: true })
  useTeamsStore.setState({ items: { team1: team }, hydrated: true })
  useUsersStore.setState({ items: Object.fromEntries(users.map((user) => [user.id, user])), hydrated: true })
  useTasksStore.setState({ items: { task1: task }, hydrated: true })
  useDashboardsStore.setState({ items: { d1: dashboard }, hydrated: true })
  useCustomFieldsStore.setState({ items: {}, hydrated: true })
  useGoalsStore.setState({ items: {}, hydrated: true })
  usePortfoliosStore.setState({ items: {}, hydrated: true })
  useProjectsStore.setState({ items: {}, hydrated: true })
  useSavedViewsStore.setState({ items: {}, hydrated: true })
  useSectionsStore.setState({ items: {}, hydrated: true })
  useTagsStore.setState({ items: {}, hydrated: true })
}

describe('Phase 6 browser exit gate', () => {
  beforeEach(() => seed())

  it('renders viewers read-only and editors with mutation controls', async () => {
    const viewer = render(<DashboardPage workspaceId="w1" dashboardId="d1" basePath="/dashboard/project-management/w/w1" />)
    await expect.element(viewer.getByText('This dashboard is waiting for its first chart')).toBeVisible()
    await expect.element(viewer.getByRole('button', { name: /Export PNG/ })).toBeVisible()
    await expect.element(viewer.getByRole('button', { name: 'Add chart' })).not.toBeInTheDocument()
    await expect.element(viewer.getByRole('button', { name: 'Schedule digest' })).not.toBeInTheDocument()
    await expect.element(viewer.getByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    viewer.unmount()

    seed('editor')
    const editor = render(<DashboardPage workspaceId="w1" dashboardId="d1" basePath="/dashboard/project-management/w/w1" />)
    await expect.element(editor.getByRole('button', { name: 'Add chart' }).first()).toBeVisible()
    await expect.element(editor.getByRole('button', { name: 'Schedule digest' })).toBeVisible()
    await expect.element(editor.getByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('exposes drill-down records as a labelled dialog with keyboard-native links', async () => {
    const close = vi.fn()
    const screen = render(
      <DrillDownPanel
        chart={chart}
        recordIds={['task1']}
        label="Incomplete"
        basePath="/dashboard/project-management/w/w1"
        onClose={close}
      />,
    )
    await expect.element(screen.getByRole('dialog', { name: 'Incomplete' })).toBeVisible()
    const link = screen.getByRole('link', { name: 'Accessible task' })
    await expect.element(link).toHaveAttribute('href', '/dashboard/project-management/w/w1/tasks/task1')
    await screen.getByRole('button', { name: 'Close drill-down' }).click()
    expect(close).toHaveBeenCalledOnce()
  })
})

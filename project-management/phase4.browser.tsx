import { useState } from 'react'
import { page } from '@vitest/browser/context'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import type { Project, ProjectView, Task, Team, User, Workspace } from './types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'workspace-1' }),
  usePathname: () =>
    '/dashboard/project-management/w/workspace-1/projects/project-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    signOut: vi.fn(),
    user: { uid: 'user-1' },
    loading: false,
  }),
}))

import { ProjectViewCards } from './features/projects/ProjectViewCards'
import { TasklyticSidebar } from './features/shell/TasklyticSidebar'
import { TimerBanner } from './features/psa/time/TimerBanner'
import { TaskTrackTimerButton } from './features/psa/time/TaskTrackTimerButton'
import { ProjectFilesGrid } from './features/attachments/ProjectFilesGrid'
import { AttachmentsZone } from './features/attachments/AttachmentsZone'
import { ProjectSettingsDialog } from './features/projects/ProjectSettingsDialog'
import { CreateProjectDialog } from './features/projects/CreateProjectDialog'
import { CreateFormDialog } from './features/forms/CreateFormDialog'
import { CreateDashboardDialog } from './features/reporting/CreateDashboardDialog'
import { ProjectPage } from './features/projects/ProjectPage'
import { TasklyticTopbarActions } from './features/shell/TasklyticTopbarActions'
import { CommandPalette } from './features/shell/CommandPalette'
import { WorkspaceSwitcher } from './features/workspaces/WorkspaceSwitcher'
import { InboxPage } from './features/inbox/InboxPage'
import { useGlobalHotkeys } from './hooks/useGlobalHotkeys'
import { useAuthStore, useUiStore } from './stores/auth'
import {
  useAttachmentsStore,
  useDashboardsStore,
  useFormsStore,
  useNotificationsStore,
  useProjectsStore,
  useTasksStore,
  useTeamsStore,
  useUsersStore,
  useWorkspacesStore,
} from './stores/entities'
import { useTimerStore } from './stores/timerStore'
import { getFileStorageAdapter } from './lib/fileStorage'

const timestamp = '2026-08-12T10:00:00.000Z'
const user: User = {
  id: 'user-1',
  name: 'Alex Admin',
  email: 'alex@example.com',
  avatarColor: '#cc785c',
  role: 'admin',
  starredProjectIds: [],
  createdAt: timestamp,
}
const secondUser: User = {
  id: 'user-2',
  name: 'Morgan Member',
  email: 'morgan@example.com',
  avatarColor: '#5d8aa8',
  role: 'member',
  starredProjectIds: [],
  createdAt: timestamp,
}
const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Northstar',
  memberIds: [user.id, secondUser.id],
  adminIds: [user.id],
  createdAt: timestamp,
}
const secondWorkspace: Workspace = {
  ...workspace,
  id: 'workspace-2',
  name: 'Advisory West',
}
const team: Team = {
  id: 'team-1',
  workspaceId: workspace.id,
  name: 'Advisory',
  memberIds: [user.id],
  adminIds: [user.id],
  privacy: 'public',
}
const project: Project = {
  id: 'project-1',
  workspaceId: workspace.id,
  teamId: team.id,
  name: 'Close project',
  color: 'primary',
  privacy: 'public_to_team',
  memberIds: [user.id],
  ownerId: user.id,
  defaultView: 'list',
  enabledViews: ['list', 'board', 'calendar', 'timeline', 'gantt'],
  status: 'on_track',
  archived: false,
  isTemplate: false,
  customFieldIds: [],
  sectionIds: [],
  createdAt: timestamp,
  modifiedAt: timestamp,
}
const task: Task = {
  id: 'task-1',
  workspaceId: workspace.id,
  name: 'Reconcile cash',
  resourceSubtype: 'default_task',
  completed: false,
  collaboratorIds: [],
  projectIds: [project.id],
  sectionIdByProject: {},
  tagIds: [],
  customFieldValues: {},
  dependencyIds: [],
  dependentIds: [],
  attachmentIds: [],
  likedByIds: [],
  createdAt: timestamp,
  modifiedAt: timestamp,
}
const secondTask: Task = { ...task, id: 'task-2', name: 'Review variance' }

function seed() {
  useAuthStore.setState({ currentUserId: user.id, hydrated: true })
  useUiStore.setState({
    activeWorkspaceId: workspace.id,
    sidebarCollapsed: false,
    sidebarWidth: 240,
  })
  useWorkspacesStore.setState({
    items: { [workspace.id]: workspace, [secondWorkspace.id]: secondWorkspace },
    hydrated: true,
  })
  useUsersStore.setState({
    items: { [user.id]: user, [secondUser.id]: secondUser },
    hydrated: true,
  })
  useTeamsStore.setState({ items: { [team.id]: team }, hydrated: true })
  useProjectsStore.setState({
    items: { [project.id]: project },
    hydrated: true,
  })
  useTasksStore.setState({
    items: { [task.id]: task, [secondTask.id]: secondTask },
    hydrated: true,
  })
  useAttachmentsStore.setState({ items: {}, hydrated: true })
  useFormsStore.setState({ items: {}, hydrated: true })
  useDashboardsStore.setState({ items: {}, hydrated: true })
  useNotificationsStore.setState({
    items: {
      'notification-1': {
        id: 'notification-1',
        userId: user.id,
        actorId: secondUser.id,
        type: 'assigned',
        scope: { type: 'task', id: task.id },
        message: 'Morgan assigned Reconcile cash to you',
        unread: true,
        archived: false,
        createdAt: timestamp,
      },
    },
    hydrated: true,
  })
  useTimerStore.setState({ runningByUser: {} })
}

function ViewHarness() {
  const [defaultView, setDefaultView] = useState<ProjectView>('list')
  const [enabledViews, setEnabledViews] = useState<ProjectView[]>(
    project.enabledViews,
  )
  return (
    <>
      <output aria-label="Selected view">{defaultView}</output>
      <ProjectViewCards
        defaultView={defaultView}
        enabledViews={enabledViews}
        onDefaultChange={setDefaultView}
        onEnabledChange={setEnabledViews}
      />
    </>
  )
}

function HotkeyHarness() {
  const [timerCount, setTimerCount] = useState(0)
  useGlobalHotkeys({
    onToggleTimer: () => setTimerCount((count) => count + 1),
  })
  return <output aria-label="Timer count">{timerCount}</output>
}

function SharedCreateHarness() {
  const [formOpen, setFormOpen] = useState(false)
  const [dashboardOpen, setDashboardOpen] = useState(false)

  return (
    <>
      <TasklyticTopbarActions
        onCreateTask={() => undefined}
        onCreateProject={() => undefined}
        onCreateForm={() => setFormOpen(true)}
        onCreatePortfolio={() => undefined}
        onCreateDashboard={() => setDashboardOpen(true)}
      />
      <CreateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        workspaceId={workspace.id}
        onCreated={() => undefined}
      />
      <CreateDashboardDialog
        open={dashboardOpen}
        onOpenChange={setDashboardOpen}
        workspaceId={workspace.id}
        onCreated={() => undefined}
      />
    </>
  )
}

describe('Phase 4 desktop and mobile browser gate', () => {
  beforeEach(() => seed())

  it('exposes Teams and My Searches navigation on desktop', async () => {
    await page.viewport(1440, 900)
    const screen = render(<TasklyticSidebar />)
    await expect
      .element(screen.getByRole('link', { name: 'Teams' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'My Searches' }))
      .toBeVisible()
    expect(
      (
        await screen.getByRole('link', { name: 'My Searches' }).element()
      ).getAttribute('href'),
    ).toContain('/my-searches')
    await page.viewport(390, 844)
    await expect
      .element(screen.getByRole('link', { name: 'Teams' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'My Searches' }))
      .toBeVisible()
  })

  it('keeps global product navigation and local Tasklytic navigation available together', async () => {
    await page.viewport(1440, 900)
    const screen = render(
      <div className="flex">
        <SidebarProvider defaultOpen>
          <AppSidebar />
        </SidebarProvider>
        <TasklyticSidebar />
      </div>,
    )

    await expect
      .element(screen.getByRole('link', { name: 'Tasklytic' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('link', { name: 'Close project' }))
      .toBeVisible()
  })

  it('switches workspaces without replacing the shared application shell', async () => {
    const screen = render(<WorkspaceSwitcher fullWidth />)
    await screen.getByRole('button', { name: workspace.name }).click()
    await page.getByRole('menuitem', { name: /Advisory West/ }).click()
    await expect
      .poll(() => useUiStore.getState().activeWorkspaceId)
      .toBe(secondWorkspace.id)
  })

  it('keeps a 240px resizable desktop navigator, a 56px rail, and an expanded mobile drawer', async () => {
    await page.viewport(1440, 900)
    const desktop = render(<TasklyticSidebar />)
    expect(
      (desktop.container.querySelector('aside') as HTMLElement).style.width,
    ).toBe('240px')
    await desktop.getByRole('button', { name: 'Collapse sidebar' }).click()
    expect(
      (desktop.container.querySelector('aside') as HTMLElement).style.width,
    ).toBe('56px')
    await expect
      .poll(
        () =>
          JSON.parse(localStorage.getItem('tasklytic:ui') ?? '{}')?.state
            ?.sidebarCollapsed,
      )
      .toBe(true)
    const persistedSidebar = localStorage.getItem('tasklytic:ui')
    desktop.unmount()

    useUiStore.setState({ sidebarCollapsed: false })
    if (persistedSidebar) localStorage.setItem('tasklytic:ui', persistedSidebar)
    await useUiStore.persist.rehydrate()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)

    useUiStore.setState({ sidebarCollapsed: false })
    await page.viewport(1024, 768)
    const breakpoint = render(<TasklyticSidebar />)
    expect(
      (breakpoint.container.querySelector('aside') as HTMLElement).style.width,
    ).toBe('240px')
    breakpoint.unmount()

    await page.viewport(390, 844)
    const drawer = render(<TasklyticSidebar mode="drawer" />)
    expect(
      (drawer.container.querySelector('aside') as HTMLElement).style.width,
    ).toBe('100%')
    await expect
      .element(drawer.getByRole('button', { name: 'Collapse sidebar' }))
      .not.toBeInTheDocument()
    expect(drawer.container.querySelector('[role="separator"]')).toBeNull()
  })

  it('keeps all five project views distinct at mobile width', async () => {
    await page.viewport(390, 844)
    const screen = render(<ViewHarness />)
    for (const name of ['List', 'Board', 'Calendar', 'Timeline', 'Gantt']) {
      await expect
        .element(screen.getByText(name, { exact: true }))
        .toBeVisible()
    }
    await screen.getByText('Gantt', { exact: true }).click()
    await expect
      .element(screen.getByLabelText('Selected view'))
      .toHaveTextContent('gantt')
  })

  it('recovers a persisted timer with Save, Continue, and Discard', async () => {
    useTimerStore.getState().start({
      workspaceId: workspace.id,
      userId: user.id,
      taskId: task.id,
      projectId: project.id,
      startedAt: timestamp,
      description: task.name,
      billable: true,
    })
    const screen = render(<TimerBanner />)
    await expect.element(screen.getByText(/running timer on/)).toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Save' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Continue' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('button', { name: 'Discard' }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'Save' }).click()
    await expect
      .element(page.getByRole('button', { name: 'Cancel' }))
      .toBeVisible()
  })

  it('offers Form and Dashboard from the shared top-bar Create action', async () => {
    await page.viewport(1440, 900)
    const screen = render(<SharedCreateHarness />)
    await screen.getByRole('button', { name: 'Create in Tasklytic' }).click()
    await expect
      .element(page.getByRole('menuitem', { name: 'Form' }))
      .toBeVisible()
    await expect
      .element(page.getByRole('menuitem', { name: 'Dashboard' }))
      .toBeVisible()
    await expect
      .element(page.getByRole('menuitem', { name: 'Goal' }))
      .not.toBeInTheDocument()

    await page.getByRole('menuitem', { name: 'Form' }).click()
    await page.getByLabelText('Form name').fill('Browser intake')
    await page.getByRole('button', { name: 'Create form' }).click()
    await expect
      .poll(() =>
        useFormsStore
          .getState()
          .list()
          .some((form) => form.name === 'Browser intake'),
      )
      .toBe(true)

    await screen.getByRole('button', { name: 'Create in Tasklytic' }).click()
    await page.getByRole('menuitem', { name: 'Dashboard' }).click()
    const dashboardDialog = page.getByRole('dialog')
    await dashboardDialog.getByLabelText('Name').fill('Browser dashboard')
    await dashboardDialog
      .getByRole('button', { name: 'Create', exact: true })
      .click()
    await expect
      .poll(() =>
        useDashboardsStore
          .getState()
          .list()
          .some((dashboard) => dashboard.name === 'Browser dashboard'),
      )
      .toBe(true)
  })

  it('opens Tasklytic command search and the inbox workflow', async () => {
    useUiStore.getState().setCommandPaletteOpen(true)
    const command = render(<CommandPalette />)
    await page.getByPlaceholder('Search project management…').fill('Reconcile')
    await expect
      .element(page.getByText('Reconcile cash', { exact: true }))
      .toBeVisible()
    command.unmount()

    const inbox = render(<InboxPage />)
    await expect
      .element(inbox.getByRole('heading', { name: 'Inbox' }))
      .toBeVisible()
    await expect
      .element(inbox.getByRole('heading', { name: 'Reconcile cash' }))
      .toBeVisible()
    await inbox.getByRole('checkbox', { name: 'Select notification' }).click()
    await expect
      .element(
        inbox.getByRole('button', { name: 'Archive', exact: true }).last(),
      )
      .toBeVisible()
  })

  it('completes project creation and exposes all project settings destinations', async () => {
    const create = render(
      <CreateProjectDialog
        open
        onOpenChange={() => undefined}
        workspaceId={workspace.id}
      />,
    )
    await create.getByRole('button', { name: 'Continue' }).click()
    await create.getByLabelText('Name').fill('Browser-created project')
    await create.getByRole('button', { name: 'Continue' }).click()
    await expect
      .element(create.getByText('Gantt', { exact: true }))
      .toBeVisible()
    await create.getByRole('button', { name: 'Create project' }).click()
    await expect
      .poll(() =>
        useProjectsStore
          .getState()
          .list()
          .some((item) => item.name === 'Browser-created project'),
      )
      .toBe(true)

    const settings = render(
      <ProjectSettingsDialog
        project={project}
        workspaceId={workspace.id}
        currentUserId={user.id}
        open
        onOpenChange={() => undefined}
      />,
    )
    for (const tab of [
      'General',
      'Members',
      'Views',
      'Custom fields',
      'Notifications',
      'Sections',
      'Advanced',
    ]) {
      await expect
        .element(settings.getByRole('tab', { name: tab }))
        .toBeVisible()
    }

    await settings.getByRole('tab', { name: 'Members' }).click()
    await settings.getByRole('button', { name: '+ Add members' }).click()
    await page.getByRole('button', { name: 'Morgan Member' }).click()
    await expect
      .poll(() => useProjectsStore.getState().getById(project.id)?.memberIds)
      .toContain(secondUser.id)

    await settings.getByRole('tab', { name: 'Custom fields' }).click()
    await expect
      .element(settings.getByRole('button', { name: 'Create field' }))
      .toBeVisible()

    await settings.getByRole('tab', { name: 'Views' }).click()
    await settings.getByRole('button', { name: 'Board', exact: true }).click()

    await settings.getByRole('tab', { name: 'Notifications' }).click()
    await settings.getByRole('switch').first().click()
    await expect
      .poll(
        () =>
          useProjectsStore.getState().getById(project.id)?.notificationSettings
            ?.taskActivity,
      )
      .toBe(false)

    await settings.getByRole('tab', { name: 'General' }).click()
    await settings
      .getByLabelText('Name', { exact: true })
      .fill('Close project updated')
    await settings
      .getByLabelText('Description')
      .fill('Monthly close controls and review.')
    await settings.getByRole('button', { name: 'Save changes' }).click()
    await expect
      .poll(() => useProjectsStore.getState().getById(project.id)?.name)
      .toBe('Close project updated')
    expect(useProjectsStore.getState().getById(project.id)?.defaultView).toBe(
      'board',
    )
    expect(
      useProjectsStore.getState().getById(project.id)?.description,
    ).toContain('Monthly close controls')

    await settings.getByRole('tab', { name: 'Advanced' }).click()
    await settings
      .getByRole('button', { name: 'Delete project permanently' })
      .click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect
      .poll(() => useProjectsStore.getState().getById(project.id))
      .toBeUndefined()
  })

  it('renders every project tab without aliasing Timeline and Gantt', async () => {
    for (const view of [
      'overview',
      'messages',
      'list',
      'board',
      'calendar',
      'timeline',
      'gantt',
      'dashboard',
      'files',
    ]) {
      const screen = render(
        <ProjectPage projectId={project.id} routeView={view} />,
      )
      expect(
        screen.container.querySelector(`[data-project-view="${view}"]`),
      ).not.toBeNull()
      if (view === 'timeline')
        await expect
          .element(screen.getByRole('button', { name: 'Save baseline' }))
          .not.toBeInTheDocument()
      if (view === 'gantt')
        await expect
          .element(screen.getByRole('button', { name: 'Save baseline' }))
          .toBeVisible()
      screen.unmount()
    }
  })

  it('opens the configured project default view from the existing base URL', () => {
    useProjectsStore.setState({
      items: { [project.id]: { ...project, defaultView: 'board' } },
      hydrated: true,
    })
    const screen = render(<ProjectPage projectId={project.id} />)
    expect(
      screen.container.querySelector('[data-project-view="board"]'),
    ).not.toBeNull()
  })

  it('searches files, switches layouts, and authorizes deletion', async () => {
    const uploaded = await getFileStorageAdapter().upload({
      file: new File(['phase-4-cover'], 'cash-reconciliation.png', {
        type: 'image/png',
      }),
      ownerId: user.id,
      scope: 'task',
      scopeId: task.id,
      workspaceId: workspace.id,
    })
    useAttachmentsStore.setState({
      items: {
        'attachment-1': {
          id: 'attachment-1',
          name: uploaded.name,
          size: uploaded.size,
          mime: uploaded.mime,
          dataUrl: uploaded.dataUrl,
          storageRef: uploaded.ref,
          storage: uploaded.storage,
          uploadedBy: user.id,
          taskId: task.id,
          createdAt: timestamp,
        },
      },
      hydrated: true,
    })
    useTasksStore.setState({
      items: { [task.id]: { ...task, attachmentIds: ['attachment-1'] } },
      hydrated: true,
    })
    const screen = render(<ProjectFilesGrid project={project} />)
    await screen.getByPlaceholder('Search files…').fill('cash')
    await expect
      .element(screen.getByText('cash-reconciliation.png'))
      .toBeVisible()
    await expect
      .element(screen.getByRole('combobox', { name: 'File type' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('combobox', { name: 'Uploader' }))
      .toBeVisible()
    await expect
      .element(screen.getByRole('combobox', { name: 'Sort files' }))
      .toBeVisible()
    await screen.getByRole('button', { name: 'List layout' }).click()
    await expect
      .element(screen.getByText('Uploaded by', { exact: true }))
      .toBeVisible()
    await screen
      .getByRole('checkbox', { name: 'Select cash-reconciliation.png' })
      .click()
    await expect
      .element(screen.getByRole('button', { name: 'Delete' }))
      .toBeEnabled()
    await screen.getByRole('button', { name: /Download \(1\)/ }).click()

    useWorkspacesStore.setState({
      items: {
        [workspace.id]: {
          ...workspace,
          adminIds: [],
          memberIds: [],
          guestIds: [user.id],
        },
      },
      hydrated: true,
    })
    await expect
      .element(screen.getByRole('button', { name: 'Delete' }))
      .toBeDisabled()

    useWorkspacesStore.setState({
      items: { [workspace.id]: workspace },
      hydrated: true,
    })
    await expect
      .element(screen.getByRole('button', { name: 'Delete' }))
      .toBeEnabled()
    const confirmDelete = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await screen.getByRole('button', { name: 'Delete' }).click()
    await expect
      .poll(() => useAttachmentsStore.getState().getById('attachment-1'))
      .toBeUndefined()
    confirmDelete.mockRestore()
  })

  it('sets an attachment image as the Board cover', async () => {
    const attachment = {
      id: 'attachment-1',
      name: 'cover.png',
      size: 2048,
      mime: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      storageRef: 'ref-1',
      storage: 'local' as const,
      uploadedBy: user.id,
      taskId: task.id,
      createdAt: timestamp,
    }
    useAttachmentsStore.setState({
      items: { [attachment.id]: attachment },
      hydrated: true,
    })
    useTasksStore.setState({
      items: { [task.id]: { ...task, attachmentIds: [attachment.id] } },
      hydrated: true,
    })
    const screen = render(
      <AttachmentsZone task={{ ...task, attachmentIds: [attachment.id] }} />,
    )
    await screen.getByRole('button', { name: 'Attachment actions' }).click()
    await page.getByRole('menuitem', { name: 'Set as cover' }).click()
    await expect
      .poll(() => useTasksStore.getState().getById(task.id)?.coverAttachmentId)
      .toBe(attachment.id)
  })

  it('requires Save, Discard, or Cancel when switching tasks', async () => {
    useTimerStore.getState().start({
      workspaceId: workspace.id,
      userId: user.id,
      taskId: task.id,
      projectId: project.id,
      startedAt: timestamp,
      description: task.name,
      billable: true,
    })
    const screen = render(<TaskTrackTimerButton task={secondTask} />)
    await screen.getByRole('button', { name: 'Start timer' }).click()
    await expect.element(page.getByText('Switch running timer?')).toBeVisible()
    for (const action of ['Save', 'Discard', 'Cancel'])
      await expect
        .element(page.getByRole('button', { name: action }))
        .toBeVisible()
  })

  it('leaves host theme shortcuts alone and uses Shift+T for timer control', async () => {
    const screen = render(<HotkeyHarness />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' }))
    await expect
      .element(screen.getByLabelText('Timer count'))
      .toHaveTextContent('0')
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'T', shiftKey: true }),
    )
    await expect
      .element(screen.getByLabelText('Timer count'))
      .toHaveTextContent('1')
  })
})

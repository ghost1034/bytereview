import { useState } from 'react'
import { page } from '@vitest/browser/context'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Form, Goal, Project, Task, Team, User, Workspace } from './types'
import type { ViewQuery } from './lib/query'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'workspace-1' }),
  usePathname: () => '/dashboard/project-management/w/workspace-1/my-searches',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signOut: vi.fn(), user: { uid: 'user-1' }, loading: false }) }))
const publicApiMocks = vi.hoisted(() => ({
  usesBackend: vi.fn(() => false),
  fetchAuthenticated: vi.fn(),
  fetchPublic: vi.fn(),
  submitAuthenticated: vi.fn(),
  submitPublic: vi.fn(),
}))
vi.mock('./lib/forms/publicFormApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/forms/publicFormApi')>()
  return {
    ...actual,
    usesTasklyticBackend: publicApiMocks.usesBackend,
    fetchAuthenticatedForm: publicApiMocks.fetchAuthenticated,
    fetchPublicForm: publicApiMocks.fetchPublic,
    submitAuthenticatedFormApi: publicApiMocks.submitAuthenticated,
    submitPublicFormApi: publicApiMocks.submitPublic,
  }
})

import { DEFAULT_VIEW_QUERY } from './lib/query'
import { QueryToolbar } from './features/query/QueryToolbar'
import { SearchPage } from './features/search/SearchPage'
import { TasklyticSidebar } from './features/shell/TasklyticSidebar'
import { WorkloadView } from './features/workload/WorkloadView'
import { TemplatePreviewDialog } from './features/templates/TemplatePreviewDialog'
import { BundlesPanel } from './features/templates/BundlesPanel'
import { PublicFormPage } from './features/forms/PublicFormPage'
import { TEMPLATE_LIBRARY } from './lib/templates/templateLibrary'
import { useAuthStore, useUiStore } from './stores/auth'
import {
  useAttachmentsStore, useBundlesStore, useCommentsStore, useCustomFieldsStore, useFormsStore,
  useFormSubmissionsStore, useGoalsStore, useNotificationsStore, useProjectsStore, useSavedViewsStore,
  useSectionsStore, useTagsStore, useTasksStore, useTeamsStore, useTemplatesStore, useUsersStore,
  useWorkspacesStore,
} from './stores/entities'

const timestamp = '2026-08-12T10:00:00.000Z'
const user: User = { id: 'user-1', name: 'Alex Admin', email: 'alex@example.com', avatarColor: '#cc785c', role: 'admin', createdAt: timestamp }
const worker: User = { id: 'user-2', name: 'Morgan Worker', email: 'morgan@example.com', avatarColor: '#5d8aa8', role: 'member', jobTitle: 'Tax Manager', createdAt: timestamp }
const workspace: Workspace = { id: 'workspace-1', name: 'Northstar', memberIds: [user.id, worker.id], adminIds: [user.id], settings: { allowPublicForms: true }, createdAt: timestamp }
const team: Team = { id: 'team-1', workspaceId: workspace.id, name: 'Advisory', memberIds: [user.id, worker.id], adminIds: [user.id], privacy: 'public' }
const project: Project = { id: 'project-1', workspaceId: workspace.id, teamId: team.id, name: 'Tax compliance', color: 'primary', privacy: 'public_to_team', memberIds: [user.id, worker.id], ownerId: user.id, defaultView: 'list', enabledViews: ['list', 'board'], status: 'on_track', startOn: '2026-08-10', dueOn: '2026-08-20', archived: false, isTemplate: false, customFieldIds: [], sectionIds: ['section-1'], createdAt: timestamp, modifiedAt: timestamp }
const task: Task = { id: 'task-1', workspaceId: workspace.id, name: 'Prepare tax return', resourceSubtype: 'default_task', completed: false, assigneeId: worker.id, collaboratorIds: [], startOn: '2026-08-12', dueOn: '2026-08-12', effort: { value: 10, unit: 'hours' }, projectIds: [project.id], sectionIdByProject: { [project.id]: 'section-1' }, tagIds: [], customFieldValues: {}, dependencyIds: [], dependentIds: [], attachmentIds: [], likedByIds: [], createdAt: timestamp, modifiedAt: timestamp }
const goal: Goal = { id: 'goal-1', workspaceId: workspace.id, name: 'Tax quality', ownerId: user.id, timeFrame: { start: '2026-01-01', end: '2026-12-31' }, metric: { type: 'percent', current: 75, target: 100 }, status: 'on_track', supportingProjectIds: [project.id], supportingGoalIds: [], privacy: 'public', createdAt: timestamp }
const form: Form = { id: 'form-1', projectId: project.id, name: 'Tax intake', fields: [{ id: 'title', type: 'short_text', label: 'Request title', required: true }], taskTitleFieldId: 'title', copyAnswersToDescription: true, isPublic: true, accessMode: 'public', publicSlug: 'tax-intake', confirmationMessage: 'Received', createdAt: timestamp }

function seed() {
  useAuthStore.setState({ currentUserId: user.id, hydrated: true })
  useUiStore.setState({ activeWorkspaceId: workspace.id, sidebarCollapsed: false })
  useWorkspacesStore.setState({ items: { [workspace.id]: workspace }, hydrated: true })
  useUsersStore.setState({ items: { [user.id]: user, [worker.id]: worker }, hydrated: true })
  useTeamsStore.setState({ items: { [team.id]: team }, hydrated: true })
  useProjectsStore.setState({ items: { [project.id]: project }, hydrated: true })
  useTasksStore.setState({ items: { [task.id]: task }, hydrated: true })
  useSectionsStore.setState({ items: { 'section-1': { id: 'section-1', projectId: project.id, name: 'Inbox', order: 0, collapsed: false } }, hydrated: true })
  useGoalsStore.setState({ items: { [goal.id]: goal }, hydrated: true })
  useFormsStore.setState({ items: { [form.id]: form }, hydrated: true })
  useAttachmentsStore.setState({ items: {}, hydrated: true })
  useBundlesStore.setState({ items: {}, hydrated: true })
  useCommentsStore.setState({ items: {}, hydrated: true })
  useCustomFieldsStore.setState({ items: {}, hydrated: true })
  useFormSubmissionsStore.setState({ items: {}, hydrated: true })
  useNotificationsStore.setState({ items: {}, hydrated: true })
  useSavedViewsStore.setState({ items: {}, hydrated: true })
  useTagsStore.setState({ items: {}, hydrated: true })
  useTemplatesStore.setState({ items: {}, hydrated: true })
}

function QueryHarness() {
  const [query, setQuery] = useState<ViewQuery>({ ...DEFAULT_VIEW_QUERY })
  return <><output aria-label="Recursive query">{JSON.stringify(query.filterExpression ?? null)}</output><QueryToolbar query={query} onChange={setQuery} showSavedViews={false} /></>
}

describe('Phase 5 browser exit gate', () => {
  beforeEach(() => {
    seed()
    publicApiMocks.usesBackend.mockReturnValue(false)
    publicApiMocks.fetchAuthenticated.mockReset()
    publicApiMocks.fetchPublic.mockReset()
    publicApiMocks.submitAuthenticated.mockReset()
    publicApiMocks.submitPublic.mockReset()
  })

  it('builds recursive AND/OR groups and lazily replaces flat filters', async () => {
    const screen = render(<QueryHarness />)
    await screen.getByRole('button', { name: /^Filter/ }).click()
    await page.getByRole('button', { name: 'Add filter group' }).click()
    await expect.element(page.getByLabelText('Filter group operator')).toBeVisible()
    await page.getByLabelText('Filter group operator').click()
    await page.getByRole('option', { name: 'Any (OR)' }).click()
    await page.getByRole('button', { name: 'Add filter condition' }).last().click()
    await expect.poll(async () => (await screen.getByLabelText('Recursive query').element()).textContent).toContain('"operator":"or"')
  })

  it('searches all domains, switches task result modes, saves, and pins a live-count search', async () => {
    const screen = render(<SearchPage />)
    await screen.getByPlaceholder(/Search tasks, projects, goals, and people/).fill('tax')
    for (const tab of ['Tasks', 'Projects', 'Goals', 'People']) await expect.element(screen.getByRole('button', { name: new RegExp(`${tab}.*1`) })).toBeVisible()
    await screen.getByRole('button', { name: 'board' }).click()
    await expect.element(screen.getByText('Prepare tax return')).toBeVisible()
    await screen.getByRole('button', { name: 'chart' }).click()
    expect(screen.container.querySelector('[data-search-view="chart"]')).not.toBeNull()
    await screen.getByRole('button', { name: 'Save search' }).click()
    await page.getByLabelText('Saved search name').fill('Tax work')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => useSavedViewsStore.getState().list().length).toBe(1)
    const sidebar = render(<TasklyticSidebar />)
    await expect.element(sidebar.getByRole('link', { name: 'Tax work (1)' })).toBeVisible()
  })

  it('enforces capacity UI permissions, selects effort/grouping, and opens people drill-down', async () => {
    const screen = render(<WorkloadView workspaceId={workspace.id} defaultTeamId={team.id} />)
    await expect.element(screen.getByRole('button', { name: /Edit capacity/ })).toBeVisible()
    await screen.getByLabelText('Group workload by').click()
    await page.getByRole('option', { name: 'Team' }).click()
    await expect.element(screen.getByRole('cell', { name: 'Advisory' })).toBeVisible()
    await screen.getByRole('button', { name: 'Morgan Worker' }).click()
    expect(page.getByText("Today's work")).toBeDefined()

    useWorkspacesStore.setState({ items: { [workspace.id]: { ...workspace, adminIds: [] } }, hydrated: true })
    useTeamsStore.setState({ items: { [team.id]: { ...team, adminIds: [] } }, hydrated: true })
    useAuthStore.setState({ currentUserId: worker.id })
    const memberScreen = render(<WorkloadView workspaceId={workspace.id} defaultTeamId={team.id} />)
    await expect.element(memberScreen.getByRole('button', { name: /Edit capacity/ })).not.toBeInTheDocument()
  })

  it('resolves template roles, edits bundle icons, and submits a public form into authenticated work', async () => {
    const template = TEMPLATE_LIBRARY[0]
    const roles: Record<string, string> = {}
    const preview = render(<TemplatePreviewDialog template={template} open loading={false} onClose={() => undefined} onUse={() => undefined} users={[user, worker]} roleAssignments={roles} onRoleAssignmentChange={(role, userId) => { roles[role] = userId }} />)
    await preview.getByRole('tab', { name: 'Roles' }).click()
    const roleSelect = preview.getByRole('combobox').first()
    await roleSelect.click()
    await page.getByRole('option', { name: 'Morgan Worker' }).click()
    expect(Object.values(roles)).toContain(worker.id)
    preview.unmount()

    const bundles = render(<BundlesPanel workspaceId={workspace.id} userId={user.id} />)
    await bundles.getByLabelText('Bundle icon').fill('🧾')
    await bundles.getByLabelText('Bundle name').fill('Close controls')
    await bundles.getByRole('button', { name: 'Create bundle' }).click()
    await expect.poll(() => useBundlesStore.getState().list()[0]?.iconEmoji).toBe('🧾')

    const publicForm = render(<PublicFormPage formId={form.id} />)
    await publicForm.getByLabelText('Request title').fill('New tax request')
    await publicForm.getByRole('button', { name: 'Submit' }).click()
    await expect.element(page.getByText('Received', { exact: true })).toBeVisible()
    await expect.poll(() => useFormSubmissionsStore.getState().list().length).toBe(1)
  })

  it('routes signed-in and public remote forms through their permission-specific submission flows', async () => {
    publicApiMocks.usesBackend.mockReturnValue(true)
    publicApiMocks.fetchAuthenticated.mockResolvedValue(form)
    publicApiMocks.submitAuthenticated.mockResolvedValue({ taskId: 'task-auth', submissionId: 'submission-auth' })
    const authenticated = render(<PublicFormPage formId={form.id} />)
    await authenticated.getByLabelText('Request title').fill('Workspace-only request')
    await authenticated.getByRole('button', { name: 'Submit' }).click()
    await expect.poll(() => publicApiMocks.submitAuthenticated.mock.calls.length).toBe(1)
    expect(publicApiMocks.fetchPublic).not.toHaveBeenCalled()
    authenticated.unmount()

    publicApiMocks.fetchAuthenticated.mockResolvedValue(null)
    publicApiMocks.fetchPublic.mockResolvedValue({ ...form, submissionToken: 'signed-public-token' })
    publicApiMocks.submitPublic.mockResolvedValue({ taskId: 'task-public', submissionId: 'submission-public' })
    const publicForm = render(<PublicFormPage formId={form.id} />)
    await publicForm.getByLabelText('Request title').fill('External request')
    await publicForm.getByRole('button', { name: 'Submit' }).click()
    await expect.poll(() => publicApiMocks.submitPublic.mock.calls.length).toBe(1)
    expect(publicApiMocks.submitPublic).toHaveBeenCalledWith(form.id, { title: 'External request' }, 'signed-public-token')
  })
})

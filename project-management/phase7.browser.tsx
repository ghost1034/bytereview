import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { AiThread } from './lib/ai/settingsStore'
import type { AiProposal } from './lib/ai/types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'w1' }),
  usePathname: () => '/dashboard/project-management/w/w1/settings/ai-teammates',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./lib/forms/publicFormApi', () => ({ usesTasklyticBackend: () => true }))

const server = vi.hoisted(() => ({
  loadAiSettings: vi.fn(), loadAiThreads: vi.fn(), migrateAiThreads: vi.fn(),
  editServerProposal: vi.fn(), acceptServerProposal: vi.fn(), discardServerProposal: vi.fn(),
  loadAiTeammates: vi.fn(), saveAiTeammate: vi.fn(),
}))
vi.mock('./lib/ai/serverState', () => server)

import { AiProposalCard } from './features/ai/AiProposalCard'
import { AiTeammatesSettingsPage } from './features/ai/AiTeammatesSettingsPage'
import { usePersistentAiState } from './features/ai/usePersistentAiState'
import { useAiSettingsStore } from './lib/ai/settingsStore'
import { useUiStore } from './stores/auth'
import { useTeamsStore, useWorkspacesStore } from './stores/entities'

const localThread: AiThread = {
  id: 'local-thread', workspaceId: 'w1', title: 'Local', messages: [],
  updatedAt: '2026-08-12T00:00:00Z',
}
const serverThread: AiThread = {
  id: 'server-thread', workspaceId: 'w1', title: 'Persisted', messages: [],
  updatedAt: '2026-08-12T01:00:00Z',
}

function PersistenceHarness() {
  const state = usePersistentAiState('w1', 'owner')
  const allThreads = useAiSettingsStore((current) => current.threads)
  const threads = allThreads.filter((thread) => thread.workspaceId === 'w1')
  return <p>{state.ready ? `${threads.length}:${threads[0]?.title}` : state.error ?? 'Loading'}</p>
}

describe('Phase 7 browser exit gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAiSettingsStore.setState({
      enabled: true, paused: false, model: 'gemini-2.5-flash', activeThreadId: null, threads: [localThread],
    })
    useUiStore.setState({ activeWorkspaceId: 'w1' })
    useWorkspacesStore.setState({ items: { w1: {
      id: 'w1', name: 'Acme', memberIds: ['owner'], adminIds: ['owner'], createdAt: '2026-08-12T00:00:00Z',
    } }, hydrated: true })
    useTeamsStore.setState({ items: {}, hydrated: true })
  })

  it('migrates local history only after server success and then hydrates persisted threads', async () => {
    server.loadAiSettings
      .mockResolvedValueOnce({ enabled: true, paused: false, model: 'gemini-2.5-flash', localThreadsMigrated: false })
      .mockResolvedValueOnce({ enabled: true, paused: false, model: 'gemini-2.5-flash', localThreadsMigrated: true })
    server.migrateAiThreads.mockResolvedValue({ migrated: true, threads: [serverThread] })
    server.loadAiThreads.mockResolvedValue({ threads: [serverThread] })

    const first = render(<PersistenceHarness />)
    await expect.element(first.getByText('1:Persisted')).toBeVisible()
    expect(server.migrateAiThreads).toHaveBeenCalledOnce()
    expect(server.migrateAiThreads).toHaveBeenCalledWith('w1', 'owner', [localThread])
    first.unmount()

    const second = render(<PersistenceHarness />)
    await expect.element(second.getByText('1:Persisted')).toBeVisible()
    expect(server.migrateAiThreads).toHaveBeenCalledOnce()
    expect(server.loadAiThreads).toHaveBeenCalledOnce()
  })

  it('previews and edits proposal JSON before explicit server acceptance', async () => {
    const proposal: AiProposal = {
      id: 'proposal-1', type: 'create_task', title: 'Create task', preview: 'Original task',
      payload: { workspaceId: 'w1', name: 'Original task' }, status: 'pending', revision: 1,
    }
    server.editServerProposal.mockResolvedValue({ ...proposal, revision: 2 })
    server.acceptServerProposal.mockResolvedValue({ ...proposal, status: 'accepted' })
    const screen = render(<AiProposalCard proposal={proposal} actorId="owner" />)
    await expect.element(screen.getByText('Original task')).toBeVisible()
    await screen.getByRole('button', { name: 'Edit' }).click()
    const editor = screen.getByRole('textbox', { name: 'Editable proposal JSON' })
    await editor.fill('{"workspaceId":"w1","name":"Edited task"}')
    await screen.getByRole('button', { name: 'Apply' }).click()
    await expect.element(screen.getByText('Proposal accepted and applied on the server.')).toBeVisible()
    expect(server.editServerProposal).toHaveBeenCalledWith('proposal-1', { workspaceId: 'w1', name: 'Edited task' })
    expect(server.acceptServerProposal).toHaveBeenCalledWith('proposal-1')
  })

  it('configures scheduled teammates with visible scope and rate controls', async () => {
    const tria = {
      id: 'job-1', workspaceId: 'w1', teammate: 'tria', enabled: true,
      scope: { type: 'workspace', id: 'w1' }, cadence: 'event', timezone: 'UTC',
      nextRunAt: '2026-08-13T00:00:00Z', dailyLimit: 10, runsToday: 0, config: {},
    }
    server.loadAiTeammates.mockResolvedValue({ jobs: [tria] })
    server.saveAiTeammate.mockResolvedValue(tria)
    const screen = render(<AiTeammatesSettingsPage />)
    await expect.element(screen.getByRole('heading', { name: 'Tria' })).toBeVisible()
    await expect.element(screen.getByText(/daily limits, metered usage/)).toBeVisible()
    await screen.getByRole('button', { name: 'Save Tria' }).click()
    await expect.element(screen.getByText('Tria schedule saved.')).toBeVisible()
    expect(server.saveAiTeammate).toHaveBeenCalledWith('w1', expect.objectContaining({
      teammate: 'tria', dailyLimit: 10, scope: { type: 'workspace', id: 'w1' },
    }))
  })
})

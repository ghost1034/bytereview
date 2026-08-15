import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { Team, User, Workspace } from '../../types'

vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceId: 'workspace-1' }),
}))

import { localRepositoryAdapter } from '../../lib/repository/localAdapter'
import { useAuthStore } from '../../stores/auth'
import {
  useTeamsStore,
  useUsersStore,
  useWorkspaceInvitationsStore,
  useWorkspacesStore,
} from '../../stores/entities'
import { InvitePeopleDialog } from './InvitePeopleDialog'

const createdAt = '2026-08-15T12:00:00.000Z'
const user: User = {
  id: 'user-1',
  name: 'Alex Admin',
  email: 'alex@example.com',
  avatarColor: '#cc785c',
  role: 'admin',
  starredProjectIds: [],
  createdAt,
}
const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Northstar',
  memberIds: [user.id],
  adminIds: [user.id],
  createdAt,
}
const team: Team = {
  id: 'team-1',
  workspaceId: workspace.id,
  name: 'Advisory',
  memberIds: [user.id],
  adminIds: [user.id],
  privacy: 'public',
}

describe('navigator invite dialog', () => {
  beforeEach(async () => {
    await localRepositoryAdapter.clearAll()
    useAuthStore.setState({ currentUserId: user.id, hydrated: true })
    useWorkspacesStore.setState({ items: { [workspace.id]: workspace }, hydrated: true })
    useUsersStore.setState({ items: { [user.id]: user }, hydrated: true })
    useTeamsStore.setState({ items: { [team.id]: team }, hydrated: true })
    useWorkspaceInvitationsStore.setState({ items: {}, hydrated: true })
  })

  it('sends invitations with the active workspace and inviter context', async () => {
    const screen = render(<InvitePeopleDialog open onOpenChange={vi.fn()} />)

    await screen.getByLabelText('Email addresses').fill('new.member@example.com')
    await screen.getByRole('button', { name: 'Send invites' }).click()

    await expect.element(screen.getByText('Queued locally')).toBeVisible()
    await expect.poll(() =>
      useWorkspaceInvitationsStore
        .getState()
        .list()
        .some((invitation) =>
          invitation.workspaceId === workspace.id &&
          invitation.invitedById === user.id &&
          invitation.email === 'new.member@example.com'
        )
    ).toBe(true)
  })
})

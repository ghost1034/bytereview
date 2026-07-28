import { tasklyticApiJson } from '../tasklyticApi'
import { usesTasklyticBackend } from '../forms/publicFormApi'
import { useUiStore, useAuthStore } from '../../stores/auth'
import {
  useTeamsStore,
  useUsersStore,
  useWorkspaceInvitationsStore,
  useWorkspacesStore,
} from '../../stores/entities'

export type AcceptInviteResult = {
  workspaceId: string
  role: string
}

/** Accept a workspace invitation by token (requires signed-in user). */
export async function acceptWorkspaceInvite(token: string): Promise<AcceptInviteResult> {
  const normalizedToken = token.trim()
  if (usesTasklyticBackend()) {
    return tasklyticApiJson<AcceptInviteResult>('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: normalizedToken }),
    })
  }

  const invitation = useWorkspaceInvitationsStore
    .getState()
    .list()
    .find((row) => row.token === normalizedToken)
  if (!invitation || invitation.status !== 'pending') {
    throw new Error('This invitation is invalid or is no longer available.')
  }
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    await useWorkspaceInvitationsStore.getState().update(invitation.id, { status: 'expired' })
    throw new Error('This invitation has expired.')
  }

  const userId = useAuthStore.getState().currentUserId
  const user = userId ? useUsersStore.getState().getById(userId) : undefined
  if (!userId || !user) throw new Error('Sign in to accept this invitation.')
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new Error(`This invitation was sent to ${invitation.email}. Sign in with that address to accept it.`)
  }

  const workspace = useWorkspacesStore.getState().getById(invitation.workspaceId)
  if (!workspace) throw new Error('The invited workspace is no longer available.')

  const memberIds = Array.from(new Set([...workspace.memberIds, userId]))
  const adminIds = invitation.role === 'admin'
    ? Array.from(new Set([...workspace.adminIds, userId]))
    : workspace.adminIds.filter((id) => id !== userId)
  const guestIds = invitation.role === 'guest'
    ? Array.from(new Set([...(workspace.guestIds ?? []), userId]))
    : (workspace.guestIds ?? []).filter((id) => id !== userId)

  await useWorkspacesStore.getState().update(workspace.id, { memberIds, adminIds, guestIds })
  if (invitation.teamId) {
    const team = useTeamsStore.getState().getById(invitation.teamId)
    if (team) {
      await useTeamsStore.getState().update(team.id, {
        memberIds: Array.from(new Set([...team.memberIds, userId])),
        guestIds: invitation.role === 'guest'
          ? Array.from(new Set([...(team.guestIds ?? []), userId]))
          : team.guestIds,
      })
    }
  }
  await useWorkspaceInvitationsStore.getState().update(invitation.id, { status: 'accepted' })
  useUiStore.getState().setActiveWorkspaceId(workspace.id)

  return { workspaceId: workspace.id, role: invitation.role }
}

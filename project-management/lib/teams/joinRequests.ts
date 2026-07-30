/**
 * Private team join requests — notifications, auto-approve, audit trail.
 */
import { newId } from '../ids'
import { now } from '../time'
import type { Team, TeamJoinRequest, User, Workspace } from '../../types'
import {
  useActivityStore,
  useNotificationsStore,
  useTeamJoinRequestsStore,
  useTeamsStore,
  useUsersStore,
} from '../../stores/entities'
import { isTeamAdmin } from '../permissions'

function teamAdminIds(team: Team, workspace: Workspace): string[] {
  const admins = team.adminIds?.length ? team.adminIds : team.memberIds.slice(0, 1)
  return [...new Set([...admins, ...workspace.adminIds.filter((id) => team.memberIds.includes(id))])]
}

/** Request to join a private team; may auto-approve per workspace setting. */
export async function requestTeamJoin(
  team: Team,
  workspace: Workspace,
  user: User
): Promise<TeamJoinRequest> {
  const existing = useTeamJoinRequestsStore
    .getState()
    .list()
    .find((r) => r.teamId === team.id && r.userId === user.id && r.status === 'pending')
  if (existing) return existing

  const request: TeamJoinRequest = {
    id: newId(),
    workspaceId: workspace.id,
    teamId: team.id,
    userId: user.id,
    status: 'pending',
    createdAt: now(),
  }
  await useTeamJoinRequestsStore.getState().add(request)

  if (workspace.settings?.autoApprovePrivateTeamJoinRequests) {
    await approveTeamJoin(request.id, workspace.adminIds[0] ?? user.id, workspace)
    return useTeamJoinRequestsStore.getState().getById(request.id) ?? request
  }

  const notifStore = useNotificationsStore.getState()
  for (const adminId of teamAdminIds(team, workspace)) {
    await notifStore.add({
      id: newId(),
      userId: adminId,
      actorId: user.id,
      type: 'team_join_request',
      scope: { type: 'team', id: team.id },
      message: `${user.name} requested to join ${team.name}`,
      unread: true,
      archived: false,
      metadata: { joinRequestId: request.id },
      createdAt: now(),
    })
  }
  return request
}

/** Approve a pending join request and add the user to the team. */
export async function approveTeamJoin(
  requestId: string,
  reviewerId: string,
  workspace: Workspace
): Promise<void> {
  const store = useTeamJoinRequestsStore.getState()
  const request = store.getById(requestId)
  if (!request || request.status !== 'pending') return

  const team = useTeamsStore.getState().getById(request.teamId)
  if (!team) return

  const memberIds = [...new Set([...team.memberIds, request.userId])]
  await useTeamsStore.getState().update(team.id, { memberIds })
  await store.update(requestId, {
    status: 'approved',
    reviewedById: reviewerId,
    reviewedAt: now(),
  })

  const user = useUsersStore.getState().getById(request.userId)
  await useActivityStore.getState().add({
    id: newId(),
    actorId: reviewerId,
    type: 'rule_action',
    details: {
      action: 'team_join_approved',
      teamId: team.id,
      userId: request.userId,
      userName: user?.name ?? request.userId,
    },
    createdAt: now(),
  })
}

/** Reject a pending join request with audit trail. */
export async function rejectTeamJoin(
  requestId: string,
  reviewerId: string
): Promise<void> {
  const store = useTeamJoinRequestsStore.getState()
  const request = store.getById(requestId)
  if (!request || request.status !== 'pending') return

  await store.update(requestId, {
    status: 'rejected',
    reviewedById: reviewerId,
    reviewedAt: now(),
  })

  const team = useTeamsStore.getState().getById(request.teamId)
  const user = useUsersStore.getState().getById(request.userId)
  await useActivityStore.getState().add({
    id: newId(),
    actorId: reviewerId,
    type: 'rule_action',
    details: {
      action: 'team_join_rejected',
      teamId: request.teamId,
      teamName: team?.name,
      userId: request.userId,
      userName: user?.name ?? request.userId,
    },
    createdAt: now(),
  })
}

/** Join a public team immediately. */
export async function joinPublicTeam(team: Team, userId: string): Promise<void> {
  if (team.memberIds.includes(userId)) return
  await useTeamsStore.getState().update(team.id, {
    memberIds: [...team.memberIds, userId],
  })
}

/** Whether reviewer can act on join requests for a team. */
export function canReviewJoinRequest(
  user: User | null | undefined,
  team: Team,
  workspace: Workspace
): boolean {
  return isTeamAdmin(user, team, workspace)
}

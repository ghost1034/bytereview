/**
 * Synthetic member provisioning for evaluation tenants.
 */
import { colorForUser } from '../colors'
import { newId } from '../ids'
import { now } from '../time'
import type { ID, Team, User } from '../../types'
import { useTeamsStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'
import type { ProvisioningMemberSpec } from './types'

export type MemberProvisionResult = {
  userIds: ID[]
  emailToId: Map<string, ID>
}

/** Create synthetic users and attach them to workspace + teams. */
export async function provisionMembers(
  workspaceId: ID,
  ownerId: ID,
  specs: ProvisioningMemberSpec[],
  teamNameToId: Map<string, ID>
): Promise<MemberProvisionResult> {
  const usersStore = useUsersStore.getState()
  const teamsStore = useTeamsStore.getState()
  const workspacesStore = useWorkspacesStore.getState()
  const workspace = workspacesStore.getById(workspaceId)
  if (!workspace) return { userIds: [], emailToId: new Map() }

  const userIds: ID[] = []
  const emailToId = new Map<string, ID>()
  const memberIds = new Set(workspace.memberIds)
  const adminIds = new Set(workspace.adminIds)

  for (const spec of specs) {
    const id = newId()
    const user: User = {
      id,
      name: spec.name,
      email: spec.email,
      avatarColor: colorForUser(id),
      role: spec.role === 'owner' ? 'admin' : spec.role === 'guest' ? 'guest' : 'member',
      jobTitle: spec.jobTitle,
      starredProjectIds: [],
      createdAt: now(),
    }
    await usersStore.add(user)
    userIds.push(id)
    emailToId.set(spec.email.toLowerCase(), id)
    memberIds.add(id)
    if (spec.role === 'owner' || spec.role === 'admin') adminIds.add(id)

  }

  await workspacesStore.update(workspaceId, {
    memberIds: Array.from(memberIds),
    adminIds: Array.from(adminIds),
  })

  // Membership is authoritative on the server, so attach users to teams only
  // after the workspace membership transaction has completed.
  for (const spec of specs) {
    const id = emailToId.get(spec.email.toLowerCase())
    if (!id) continue
    for (const teamName of spec.teamNames ?? []) {
      const teamId = teamNameToId.get(teamName)
      if (!teamId) continue
      const team = teamsStore.getById(teamId)
      if (!team) continue
      await teamsStore.update(teamId, {
        memberIds: Array.from(new Set([...team.memberIds, id])),
      })
    }
  }

  return { userIds, emailToId }
}

/** Ensure owner is on every team. */
export async function attachOwnerToTeams(ownerId: ID, teams: Team[]): Promise<void> {
  const teamsStore = useTeamsStore.getState()
  for (const team of teams) {
    if (team.memberIds.includes(ownerId)) continue
    await teamsStore.update(team.id, {
      memberIds: [...team.memberIds, ownerId],
      adminIds: (team.adminIds ?? []).includes(ownerId)
        ? team.adminIds
        : [...(team.adminIds ?? []), ownerId],
    })
  }
}

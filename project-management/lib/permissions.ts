import type { Team, User, Workspace } from '../types'
import type {
  TasklyticCapabilities,
  TasklyticCapability,
} from './repository/types'

/** UI capability projection matching the authoritative backend policy. */
export function workspaceCapabilitiesForUser(
  user: User | null | undefined,
  workspace: Workspace | undefined,
): TasklyticCapabilities {
  const role = user && workspace ? workspaceRoleForUser(user.id, workspace) : null
  const flags = user?.roleFlags
  const isAdmin = role === 'admin'
  const isMember = role === 'member'
  return {
    view: role !== null,
    edit: isAdmin || isMember,
    submit: isAdmin || isMember || flags?.canSubmit === true,
    approve: isAdmin || flags?.canApprove === true,
    bill: isAdmin || flags?.canBill === true,
    payment: isAdmin || flags?.canRecordPayments === true,
    trust: isAdmin || flags?.canManageTrust === true,
    rate: isAdmin || flags?.canManageRates === true,
    'workspace-administration': isAdmin,
  }
}

export function canPerformWorkspaceAction(
  user: User | null | undefined,
  workspace: Workspace | undefined,
  capability: TasklyticCapability,
): boolean {
  return workspaceCapabilitiesForUser(user, workspace)[capability]
}

/** True when the user is a workspace admin. */
export function isWorkspaceAdmin(user: User | null | undefined, workspace: Workspace | undefined): boolean {
  return canPerformWorkspaceAction(user, workspace, 'workspace-administration')
}

/** True when the user is a team admin or workspace admin. */
export function isTeamAdmin(
  user: User | null | undefined,
  team: Team | undefined,
  workspace?: Workspace
): boolean {
  if (!user || !team) return false
  if (workspace && workspace.adminIds.includes(user.id)) return true
  if (team.adminIds?.includes(user.id)) return true
  return team.memberIds[0] === user.id
}

export type MemberScope =
  | { type: 'workspace'; workspace: Workspace }
  | { type: 'team'; workspace: Workspace; team: Team }

/** Whether the user can invite or remove members in the given scope. */
export function canManageMembers(user: User | null | undefined, scope: MemberScope): boolean {
  if (!user) return false
  if (scope.type === 'workspace') return isWorkspaceAdmin(user, scope.workspace)
  return isTeamAdmin(user, scope.team, scope.workspace)
}

/** Workspace role label for a member. */
export function workspaceRoleForUser(
  userId: string,
  workspace: Workspace
): 'admin' | 'member' | 'guest' {
  if (workspace.adminIds.includes(userId)) return 'admin'
  if (workspace.guestIds?.includes(userId)) return 'guest'
  return 'member'
}

/** Team role label for a member. */
export function teamRoleForUser(userId: string, team: Team): 'admin' | 'member' | 'guest' {
  if (team.adminIds?.includes(userId)) return 'admin'
  if (team.guestIds?.includes(userId)) return 'guest'
  return 'member'
}

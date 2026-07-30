import type { Team } from '../../types'

/** Whether a workspace member can see a team in listings. */
export function canViewTeam(team: Team, userId: string | null | undefined): boolean {
  if (!userId) return false
  if (team.privacy === 'secret') return team.memberIds.includes(userId)
  return true
}

/** Whether the user is already on the team. */
export function isTeamMember(team: Team, userId: string | null | undefined): boolean {
  return Boolean(userId && team.memberIds.includes(userId))
}

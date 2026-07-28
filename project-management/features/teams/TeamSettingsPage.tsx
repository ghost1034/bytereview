'use client'

/** Dedicated team settings route. */
import { usePageMeta } from '../../hooks/usePageMeta'
import { useTeam } from '../../hooks/useTeam'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { canViewTeam, isTeamMember } from '../../lib/teams/visibility'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore } from '../../stores/entities'
import { TeamSettingsTab } from './TeamSettingsTab'
import { TeamIcon } from './TeamIcon'

export function TeamSettingsPage({ teamId }: { teamId?: string | null } = {}) {
  const { workspaceId, workspace } = useWorkspaceContext()
  const team = useTeam(teamId)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const currentUser = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))

  usePageMeta({
    breadcrumbs: [
      { label: 'Teams', href: workspaceId ? `/dashboard/project-management/w/${workspaceId}/teams` : undefined },
      { label: team?.name ?? 'Team', href: teamId && workspaceId ? `/dashboard/project-management/w/${workspaceId}/teams/${teamId}` : undefined },
      { label: 'Settings' },
    ],
  })

  if (!workspace || !team || !workspaceId) return null
  if (!canViewTeam(team, currentUserId)) return <p className="text-sm">Team not found.</p>
  if (!isTeamMember(team, currentUserId)) return <p className="text-sm">Join the team to access settings.</p>

  return (
    <div className="tasklytic-root space-y-4">
      <div className="flex items-center gap-2">
        <TeamIcon name={team.name} emoji={team.iconEmoji} />
        <h1 className="font-serif text-2xl">{team.name} settings</h1>
      </div>
      <TeamSettingsTab team={team} workspace={workspace} currentUser={currentUser} />
    </div>
  )
}

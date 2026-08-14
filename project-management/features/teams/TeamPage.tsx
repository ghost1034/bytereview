'use client'

/** Team detail page with functional Overview, Projects, and Settings tabs. */
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useTeam } from '../../hooks/useTeam'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { isTeamAdmin } from '../../lib/permissions'
import { canViewTeam, isTeamMember } from '../../lib/teams/visibility'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore } from '../../stores/entities'
import { TeamIcon } from './TeamIcon'
import { TeamJoinRequestsPanel } from './TeamJoinRequestsPanel'
import { TeamOverviewTab } from './TeamOverviewTab'
import { TeamProjectsTab } from './TeamProjectsTab'
import { TeamSettingsTab } from './TeamSettingsTab'

export function TeamPage({ teamId }: { teamId?: string | null } = {}) {
  const { workspaceId, workspace } = useWorkspaceContext()
  const team = useTeam(teamId)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const currentUser = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))

  usePageMeta({
    breadcrumbs: [
      { label: 'Tasklytic', href: workspaceId ? `/dashboard/project-management/w/${workspaceId}/home` : undefined },
      { label: 'Teams', href: workspaceId ? `/dashboard/project-management/w/${workspaceId}/teams` : undefined },
      { label: team?.name ?? 'Team' },
    ],
  })

  if (!workspaceId || !workspace || !team || team.workspaceId !== workspaceId) {
    return <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Team not found.</p>
  }

  if (!canViewTeam(team, currentUserId)) {
    return <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>This team is secret — you need an invite to view it.</p>
  }

  const showAdminPanel = Boolean(currentUser && isTeamAdmin(currentUser, team, workspace))

  return (
    <div className="tasklytic-root space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <TeamIcon name={team.name} emoji={team.iconEmoji} className="h-10 w-10 text-xl" />
        <div>
          <h1 className="font-sans text-2xl">{team.name}</h1>
          <p className="text-sm capitalize" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {team.privacy} · {team.memberIds.length} members
          </p>
        </div>
      </div>

      {showAdminPanel && team.privacy === 'private' && currentUser && (
        <TeamJoinRequestsPanel team={team} workspace={workspace} reviewerId={currentUser.id} />
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <TeamOverviewTab team={team} workspace={workspace} currentUser={currentUser} workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="projects" className="mt-4">
          <TeamProjectsTab team={team} workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          {isTeamMember(team, currentUserId) ? (
            <TeamSettingsTab team={team} workspace={workspace} currentUser={currentUser} />
          ) : (
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Join the team to access settings.</p>
          )}
        </TabsContent>
      </Tabs>

      {isTeamMember(team, currentUserId) && (
        <Link
          href={`/dashboard/project-management/w/${workspaceId}/teams/${team.id}/settings`}
          className="text-xs underline"
          style={{ color: 'hsl(var(--foreground-muted))' }}
        >
          Direct link to team settings
        </Link>
      )}
    </div>
  )
}

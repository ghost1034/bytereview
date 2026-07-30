'use client'

/** TeamsPage — list workspace teams and create new teams. */
import { useState } from 'react'
import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { canViewTeam, isTeamMember } from '../../lib/teams/visibility'
import { joinPublicTeam, requestTeamJoin } from '../../lib/teams/joinRequests'
import { useAuthStore } from '../../stores/auth'
import { useTeamsStore, useUsersStore } from '../../stores/entities'
import type { Team } from '../../types'
import { CreateTeamDialog } from './CreateTeamDialog'
import { TeamIcon } from './TeamIcon'

function TeamCard({
  team,
  workspaceId,
  href,
  onJoin,
}: {
  team: Team
  workspaceId: string
  href: string
  onJoin: () => void
}) {
  const isMember = useAuthStore((s) => s.currentUserId && team.memberIds.includes(s.currentUserId))

  return (
    <li className="tl-card flex items-start gap-3 p-4 shadow-paper-sm">
      <TeamIcon name={team.name} emoji={team.iconEmoji} className="h-10 w-10 text-lg" />
      <div className="min-w-0 flex-1">
        <Link href={href} className="font-medium hover:underline">{team.name}</Link>
        {team.description && (
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>{team.description}</p>
        )}
        <p className="mt-2 text-xs capitalize" style={{ color: 'var(--ink-muted)' }}>
          {team.privacy} · {team.memberIds.length} member{team.memberIds.length === 1 ? '' : 's'}
        </p>
        {!isMember && team.privacy !== 'secret' && (
          <Button size="sm" variant="outline" className="mt-2" onClick={onJoin}>
            {team.privacy === 'public' ? 'Join' : 'Request to join'}
          </Button>
        )}
      </div>
    </li>
  )
}

export function TeamsPage() {
  const { workspaceId, workspace } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const currentUser = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const allTeams = useTeamsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const teams = allTeams.filter((t) => canViewTeam(t, currentUserId))
  const [open, setOpen] = useState(false)

  usePageMeta({ breadcrumbs: [{ label: 'Teams' }] })

  const handleJoin = async (team: Team) => {
    if (!currentUser || !workspace) return
    if (team.privacy === 'public') await joinPublicTeam(team, currentUser.id)
    else await requestTeamJoin(team, workspace, currentUser)
  }

  if (!workspaceId) return null

  return (
    <div className="tasklytic-root space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl">Teams</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
            Organize people and projects within your workspace.
          </p>
        </div>
        <Button className="tl-btn-primary gap-2" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          New team
        </Button>
      </div>

      {teams.length === 0 ? (
        <div className="tl-card flex flex-col items-center gap-3 p-10 text-center shadow-paper-sm">
          <Users className="h-10 w-10" style={{ color: 'var(--ink-faint)' }} strokeWidth={1.5} />
          <p className="font-medium">No teams yet</p>
          <Button className="tl-btn-primary" onClick={() => setOpen(true)}>Create team</Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              workspaceId={workspaceId}
              href={`/dashboard/project-management/w/${workspaceId}/teams/${team.id}`}
              onJoin={() => void handleJoin(team)}
            />
          ))}
        </ul>
      )}

      {currentUserId && (
        <CreateTeamDialog
          open={open}
          onOpenChange={setOpen}
          workspaceId={workspaceId}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}

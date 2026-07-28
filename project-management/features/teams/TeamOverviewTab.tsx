'use client'

/** Team overview tab — description, members, pinned projects, activity. */
import { useState } from 'react'
import { GripVertical, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MemberAvatarStack } from '../members/MemberAvatarStack'
import { InvitePeopleDialog } from '../members/InvitePeopleDialog'
import { TeamIcon } from './TeamIcon'
import { AdminOnlyWrap } from '../members/AdminOnlyWrap'
import { canManageMembers } from '../../lib/permissions'
import { joinPublicTeam, requestTeamJoin } from '../../lib/teams/joinRequests'
import { isTeamMember } from '../../lib/teams/visibility'
import { formatRelative } from '../../lib/time'
import type { Project, Team, User, Workspace } from '../../types'
import { useActivityStore, useProjectsStore, useTeamsStore, useUsersStore } from '../../stores/entities'

type Props = {
  team: Team
  workspace: Workspace
  currentUser: User | undefined
  workspaceId: string
}

export function TeamOverviewTab({ team, workspace, currentUser, workspaceId }: Props) {
  const users = useUsersStore((s) => s.list())
  const memberUsers = team.memberIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => Boolean(u))
  const projects = useProjectsStore((s) => s.list().filter((p) => p.teamId === team.id && !p.archived))
  const pinnedIds = team.pinnedProjectIds ?? []
  const pinned = pinnedIds.map((id) => projects.find((p) => p.id === id)).filter((p): p is Project => Boolean(p))
  const activity = useActivityStore((s) =>
    s.list().filter((e) => {
      const teamId = e.details.teamId as string | undefined
      return teamId === team.id
    }).slice(0, 10)
  )
  const [inviteOpen, setInviteOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const isMember = isTeamMember(team, currentUser?.id)
  const canManage = Boolean(currentUser && canManageMembers(currentUser, { type: 'team', workspace, team }))

  const reorderPinned = async (fromId: string, toId: string) => {
    const ids = [...pinnedIds]
    const fromIdx = ids.indexOf(fromId)
    const toIdx = ids.indexOf(toId)
    if (fromIdx < 0 || toIdx < 0) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, fromId)
    await useTeamsStore.getState().update(team.id, { pinnedProjectIds: ids })
  }

  const pinProject = async (projectId: string) => {
    if (pinnedIds.includes(projectId)) return
    await useTeamsStore.getState().update(team.id, { pinnedProjectIds: [...pinnedIds, projectId] })
  }

  const handleJoin = async () => {
    if (!currentUser) return
    if (team.privacy === 'public') await joinPublicTeam(team, currentUser.id)
    else if (team.privacy === 'private') await requestTeamJoin(team, workspace, currentUser)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <TeamIcon name={team.name} emoji={team.iconEmoji} className="h-10 w-10 text-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm capitalize" style={{ color: 'var(--ink-muted)' }}>{team.privacy} team</p>
          {team.description && <p className="mt-2 text-sm">{team.description}</p>}
        </div>
      </div>

      {!isMember && currentUser && (
        <Button className="tl-btn-primary" onClick={() => void handleJoin()}>
          {team.privacy === 'public' ? 'Join team' : 'Request to join'}
        </Button>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">Members</h3>
          <AdminOnlyWrap allowed={canManage}>
            <Button size="sm" variant="outline" className="gap-1" disabled={!canManage} onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" /> Invite
            </Button>
          </AdminOnlyWrap>
        </div>
        <MemberAvatarStack users={memberUsers} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Pinned projects</h3>
        {pinned.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>No pinned projects yet.</p>
        ) : (
          <ul className="space-y-2">
            {pinned.map((project) => (
              <li
                key={project.id}
                draggable={canManage}
                onDragStart={() => setDragId(project.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) void reorderPinned(dragId, project.id); setDragId(null) }}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                {canManage && <GripVertical className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-faint)' }} />}
                <span>{project.iconEmoji ?? '📁'}</span>
                <span className="font-medium">{project.name}</span>
              </li>
            ))}
          </ul>
        )}
        {canManage && projects.filter((p) => !pinnedIds.includes(p.id)).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {projects.filter((p) => !pinnedIds.includes(p.id)).slice(0, 5).map((p) => (
              <Button key={p.id} size="sm" variant="ghost" onClick={() => void pinProject(p.id)}>+ {p.name}</Button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Recent activity</h3>
        {activity.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Activity will appear as your team works.</p>
        ) : (
          <ul className="space-y-2">
            {activity.map((event) => (
              <li key={event.id} className="text-sm" style={{ color: 'var(--ink-secondary)' }}>
                {String(event.details.action ?? event.type)} · {formatRelative(event.createdAt)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {currentUser && (
        <InvitePeopleDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          workspaceId={workspaceId}
          workspaceName={workspace.name}
          invitedById={currentUser.id}
          invitedByName={currentUser.name}
          teams={[team]}
        />
      )}
    </div>
  )
}

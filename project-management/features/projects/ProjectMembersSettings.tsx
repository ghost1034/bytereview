'use client'

/** Project member and role editor used by project settings. */
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { now } from '../../lib/time'
import { useProjectsStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'
import type { Project } from '../../types'
import { ProjectAddMemberButton } from './ProjectAddMemberButton'
import { UserAvatar } from '../profile/UserAvatar'

export function ProjectMembersSettings({ project }: { project: Project }) {
  const update = useProjectsStore((s) => s.update)
  const workspace = useWorkspacesStore((s) => s.getById(project.workspaceId))
  const users = useUsersStore((s) => s.list())
  const members = project.memberIds
    .map((id) => users.find((user) => user.id === id))
    .filter((user): user is NonNullable<typeof user> => Boolean(user))

  const updateRole = async (userId: string, role: string) => {
    await update(project.id, {
      memberRoles: { ...project.memberRoles, [userId]: role.trim() || 'Member' },
      modifiedAt: now(),
    })
  }

  const removeMember = async (userId: string) => {
    if (userId === project.ownerId) return
    const roles = { ...project.memberRoles }
    delete roles[userId]
    await update(project.id, {
      memberIds: project.memberIds.filter((id) => id !== userId),
      memberRoles: roles,
      modifiedAt: now(),
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {members.length} of {workspace?.memberIds.length ?? members.length} workspace members
        </p>
        <ProjectAddMemberButton project={project} />
      </div>
      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
            <UserAvatar userId={member.id} size="sm" />
            <span className="min-w-32 flex-1 truncate text-sm font-medium">{member.name}</span>
            <Input
              className="tl-input h-8 w-40 text-sm"
              defaultValue={project.memberRoles?.[member.id] ?? (member.id === project.ownerId ? 'Project lead' : 'Member')}
              aria-label={`${member.name} project role`}
              onBlur={(event) => void updateRole(member.id, event.target.value)}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={member.id === project.ownerId}
              onClick={() => void removeMember(member.id)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

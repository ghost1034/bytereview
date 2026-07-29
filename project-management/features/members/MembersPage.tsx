'use client'

/** MembersPage — workspace member directory via shared MemberTable. */
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import {
  buildWorkspaceMemberRows,
  MemberTable,
} from './MemberTable'
import { useAuthStore } from '../../stores/auth'
import {
  useUsersStore,
  useWorkspaceInvitationsStore,
  useWorkspacesStore,
} from '../../stores/entities'
import { revokeWorkspaceInvite } from '../../lib/invites'

export function MembersPage() {
  const { workspaceId, workspace, teams } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const currentUser = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const users = useUsersStore((s) => s.list())
  const invitations = useWorkspaceInvitationsStore((s) =>
    s.list().filter((inv) => inv.workspaceId === workspaceId)
  )

  usePageMeta({ breadcrumbs: [{ label: 'Members' }] })

  if (!workspaceId || !workspace) return null

  const rows = buildWorkspaceMemberRows(workspace, users, invitations)

  const setWorkspaceRole = async (userId: string, role: 'admin' | 'member' | 'guest') => {
    const adminIds = workspace.adminIds.filter((id) => id !== userId)
    const guestIds = (workspace.guestIds ?? []).filter((id) => id !== userId)
    let nextAdmin = [...adminIds]
    let nextGuest = [...guestIds]
    if (role === 'admin') nextAdmin = [...nextAdmin, userId]
    if (role === 'guest') nextGuest = [...nextGuest, userId]
    await useWorkspacesStore.getState().update(workspace.id, { adminIds: nextAdmin, guestIds: nextGuest })
  }

  const removeMembers = async (keys: string[]) => {
    await useWorkspacesStore.getState().update(workspace.id, {
      memberIds: workspace.memberIds.filter((id) => !keys.includes(id)),
      adminIds: workspace.adminIds.filter((id) => !keys.includes(id)),
      guestIds: (workspace.guestIds ?? []).filter((id) => !keys.includes(id)),
    })
  }

  const revokeInvite = async (invitationId: string) => {
    await revokeWorkspaceInvite(invitationId)
  }

  return (
    <div className="tasklytic-root space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Members</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
          {rows.length} people in {workspace.name}
        </p>
      </div>
      <MemberTable
        scope={{ type: 'workspace', workspace }}
        currentUser={currentUser}
        users={users}
        invitations={invitations}
        teams={teams}
        rows={rows}
        onRoleChange={(key, role) => void setWorkspaceRole(key, role)}
        onRemove={(keys) => void removeMembers(keys)}
        onRevokeInvite={(id) => void revokeInvite(id)}
      />
    </div>
  )
}

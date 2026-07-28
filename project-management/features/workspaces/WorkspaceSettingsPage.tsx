'use client'

/** Workspace settings page — General, Members, Billing tabs. */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import {
  buildWorkspaceMemberRows,
  MemberTable,
} from '../members/MemberTable'
import { WorkspaceBillingTab } from './WorkspaceBillingTab'
import { WorkspaceGeneralTab } from './WorkspaceGeneralTab'
import { WorkspaceResetPanel } from '../onboarding/WorkspaceResetPanel'
import { useAuthStore } from '../../stores/auth'
import {
  useTeamsStore,
  useUsersStore,
  useWorkspaceInvitationsStore,
  useWorkspacesStore,
} from '../../stores/entities'

export function WorkspaceSettingsPage() {
  const { workspaceId, workspace, teams } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const currentUser = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const users = useUsersStore((s) => s.list())
  const invitations = useWorkspaceInvitationsStore((s) =>
    s.list().filter((inv) => inv.workspaceId === workspaceId)
  )

  usePageMeta({
    breadcrumbs: [
      { label: 'Settings', href: workspaceId ? `/dashboard/project-management/w/${workspaceId}/settings` : undefined },
      { label: 'Workspace' },
    ],
  })

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
    await useWorkspaceInvitationsStore.getState().update(invitationId, { status: 'revoked' })
  }

  return (
    <div className="tasklytic-root space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Workspace settings</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>{workspace.name}</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          <WorkspaceGeneralTab workspace={workspace} currentUser={currentUser} />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
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
        </TabsContent>
        <TabsContent value="billing" className="mt-4">
          <WorkspaceBillingTab workspace={workspace} currentUser={currentUser} />
        </TabsContent>
      </Tabs>

      <WorkspaceResetPanel />
    </div>
  )
}

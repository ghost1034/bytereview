'use client'

/** Connects shell invite entry points to the shared workspace invitation flow. */
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useUsersStore } from '../../stores/entities'
import { InvitePeopleDialog as WorkspaceInvitePeopleDialog } from '../members/InvitePeopleDialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InvitePeopleDialog({ open, onOpenChange }: Props) {
  const { workspaceId, workspace, teams } = useWorkspaceContext()
  const currentUserId = useAuthStore((state) => state.currentUserId)
  const currentUser = useUsersStore((state) =>
    currentUserId ? state.getById(currentUserId) : undefined
  )

  if (!workspaceId || !workspace || !currentUser) return null

  return (
    <WorkspaceInvitePeopleDialog
      open={open}
      onOpenChange={onOpenChange}
      workspaceId={workspaceId}
      workspaceName={workspace.name}
      invitedById={currentUser.id}
      invitedByName={currentUser.name}
      teams={teams}
    />
  )
}

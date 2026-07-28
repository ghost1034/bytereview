'use client'

/** Modal-route wrapper — opens create team dialog then returns to teams list. */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { CreateTeamDialog } from './CreateTeamDialog'

export function TeamsNewPage() {
  const router = useRouter()
  const { workspaceId } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (!open && workspaceId) {
      router.replace(`/dashboard/project-management/w/${workspaceId}/teams`)
    }
  }, [open, router, workspaceId])

  if (!workspaceId || !currentUserId) return null

  return (
    <CreateTeamDialog
      open={open}
      onOpenChange={setOpen}
      workspaceId={workspaceId}
      currentUserId={currentUserId}
      onCreated={(teamId) => router.replace(`/dashboard/project-management/w/${workspaceId}/teams/${teamId}`)}
    />
  )
}

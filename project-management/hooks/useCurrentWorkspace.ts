'use client'

/** Active workspace from the URL workspaceId param. */
import { useParams } from 'next/navigation'
import { useWorkspace } from './useWorkspace'

export function useCurrentWorkspace() {
  const params = useParams()
  const workspaceId = typeof params?.workspaceId === 'string' ? params.workspaceId : null
  const workspace = useWorkspace(workspaceId)
  return { workspaceId, workspace }
}

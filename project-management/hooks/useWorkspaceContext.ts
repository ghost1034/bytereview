'use client'

/** Workspace context hook — active workspace from route, UI store, or first workspace. */
import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useUiStore } from '../stores/auth'
import { useTeamsStore, useWorkspacesStore } from '../stores/entities'
import { resolveWorkspaceRouteId } from './useResolveDefaultWorkspace'

export function useWorkspaceContext() {
  const params = useParams()
  const rawParam = typeof params?.workspaceId === 'string' ? params.workspaceId : null
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const workspacesHydrated = useWorkspacesStore((s) => s.hydrated)
  const firstWorkspaceId = useWorkspacesStore((s) => {
    const rows = Object.values(s.items)
    if (!rows.length) return null
    return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? null
  })
  const workspaceId = resolveWorkspaceRouteId(rawParam, activeWorkspaceId, firstWorkspaceId)
  const workspace = useWorkspacesStore((s) => (workspaceId ? s.items[workspaceId] : undefined))
  const teams = useTeamsStore((s) =>
    s.list().filter((t) => t.workspaceId === workspaceId)
  )
  const routeIsDefault = rawParam === 'default'
  const booting = routeIsDefault && !workspaceId && !workspacesHydrated

  return useMemo(
    () => ({ workspaceId, workspace, teams, booting, routeIsDefault }),
    [booting, routeIsDefault, workspace, workspaceId, teams]
  )
}

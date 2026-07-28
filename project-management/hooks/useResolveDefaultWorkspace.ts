'use client'

import { useEffect } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { setActiveRepositoryWorkspaceId } from '../lib/repository/workspaceScope'
import { useUiStore } from '../stores/auth'
import { useWorkspacesStore } from '../stores/entities'

function pickFirstWorkspaceId(): string | null {
  const rows = useWorkspacesStore.getState().list()
  if (!rows.length) return null
  return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? null
}

/**
 * Replace `/w/default/...` with the active (or first) workspace once boot has loaded workspaces.
 */
export function useResolveDefaultWorkspace(): void {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const rawId = typeof params?.workspaceId === 'string' ? params.workspaceId : null
  const activeId = useUiStore((s) => s.activeWorkspaceId)
  const hydrated = useWorkspacesStore((s) => s.hydrated)
  const firstId = useWorkspacesStore((s) => {
    const rows = Object.values(s.items)
    if (!rows.length) return null
    return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? null
  })

  const resolvedId = activeId ?? firstId

  useEffect(() => {
    if (rawId !== 'default' || !resolvedId) return
    useUiStore.getState().setActiveWorkspaceId(resolvedId)
    setActiveRepositoryWorkspaceId(resolvedId)
  }, [rawId, resolvedId])

  useEffect(() => {
    if (rawId !== 'default' || !resolvedId || !hydrated || !pathname) return
    const suffix = pathname.replace(/^\/dashboard\/tasklytic\/w\/default/, '') || '/home'
    router.replace(`/dashboard/project-management/w/${resolvedId}${suffix}`)
  }, [hydrated, pathname, rawId, resolvedId, router])
}

/** Resolved workspace id for routing — used after server boot. */
export function resolveWorkspaceRouteId(
  rawParam: string | null,
  activeWorkspaceId: string | null,
  firstWorkspaceId: string | null
): string | null {
  if (rawParam && rawParam !== 'default') return rawParam
  return activeWorkspaceId ?? firstWorkspaceId
}

export { pickFirstWorkspaceId }

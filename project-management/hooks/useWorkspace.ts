'use client'

/** Single workspace by id from the entity store. */
import { useWorkspacesStore } from '../stores/entities'

export function useWorkspace(workspaceId: string | null | undefined) {
  return useWorkspacesStore((s) => (workspaceId ? s.getById(workspaceId) : undefined))
}

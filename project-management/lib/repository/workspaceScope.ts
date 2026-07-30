import type { EntityKind } from './types'

/** Per-user private data (not shared across workspace members). */
export const USER_PRIVATE_ENTITY_KINDS = new Set<EntityKind>([
  'session',
  'notifications',
  'pendingEmails',
])

/** True when entity reads/writes require an active workspace id. */
export function isWorkspaceScopedEntity(entity: EntityKind): boolean {
  return entity !== 'workspaces' && !USER_PRIVATE_ENTITY_KINDS.has(entity)
}

let activeWorkspaceId: string | null = null

export function setActiveRepositoryWorkspaceId(id: string | null): void {
  activeWorkspaceId = id
}

export function getActiveRepositoryWorkspaceId(): string | null {
  return activeWorkspaceId
}

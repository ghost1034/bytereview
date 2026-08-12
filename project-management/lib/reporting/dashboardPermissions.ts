/** Dashboard viewer/editor policy mirrored by the backend authorization layer. */
import type { Workspace } from '../../types'
import type { ReportingDashboard } from './types'

export function canViewDashboard(
  dashboard: ReportingDashboard,
  userId: string | null,
  workspace?: Workspace,
): boolean {
  if (!userId) return false
  if (workspace?.adminIds.includes(userId)) return true
  if (dashboard.ownerId === userId) return true
  if ((dashboard.editorIds ?? dashboard.sharedWith).includes(userId)) return true
  if ((dashboard.viewerIds ?? []).includes(userId)) return true
  return dashboard.visibility === 'workspace' && !workspace?.guestIds?.includes(userId)
}

export function canEditDashboard(
  dashboard: ReportingDashboard,
  userId: string | null,
  workspace?: Workspace,
): boolean {
  if (!userId) return false
  return Boolean(
    workspace?.adminIds.includes(userId)
    || dashboard.ownerId === userId
    || (dashboard.editorIds ?? dashboard.sharedWith).includes(userId)
  )
}

export function canManageDashboardSharing(
  dashboard: ReportingDashboard,
  userId: string | null,
  workspace?: Workspace,
): boolean {
  return Boolean(userId && (dashboard.ownerId === userId || workspace?.adminIds.includes(userId)))
}

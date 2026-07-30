import type { Notification } from '../../types'

/** Build a workspace-scoped href for a notification's underlying resource. */
export function notificationScopeHref(
  workspaceId: string,
  scope: Notification['scope'],
  metadata?: Record<string, unknown>
): string {
  const base = `/dashboard/project-management/w/${workspaceId}`
  switch (scope.type) {
    case 'task':
      return `${base}/tasks/${scope.id}`
    case 'project':
      return `${base}/projects/${scope.id}`
    case 'portfolio':
      return `${base}/portfolios?focus=${scope.id}`
    case 'goal':
      return `${base}/goals?focus=${scope.id}`
    case 'form':
      return `${base}/forms?focus=${scope.id}`
    case 'team':
      return `${base}/teams/${scope.id}`
    default:
      return base
  }
}

/** Optional status-update deep link when metadata carries updateId. */
export function notificationOpenHref(
  workspaceId: string,
  notification: Notification
): string {
  if (notification.type === 'status_update' && notification.metadata?.updateId) {
    return `${notificationScopeHref(workspaceId, notification.scope)}?updates=1&update=${String(notification.metadata.updateId)}`
  }
  if (notification.type === 'project_message' && notification.metadata?.messageId) {
    return `${notificationScopeHref(workspaceId, notification.scope)}?view=messages&messageId=${String(notification.metadata.messageId)}`
  }
  return notificationScopeHref(workspaceId, notification.scope, notification.metadata)
}

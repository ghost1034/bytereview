/**
 * Notification helpers — create, read state, archive, snooze, and inbox queries.
 */
import { addDays, setHours, setMinutes, startOfTomorrow } from 'date-fns'
import { newId } from './ids'
import { usesTasklyticBackend } from './forms/publicFormApi'
import { tasklyticApiJson } from './tasklyticApi'
import { now } from './time'
import { useAuthStore } from '../stores/auth'
import {
  useNotificationsStore,
  useProjectsStore,
  useTasksStore,
  useUsersStore,
} from '../stores/entities'
import type { Notification } from '../types'

/** Fields required to create a persisted notification. */
export type CreateNotificationInput = {
  userId: string
  actorId?: string
  type: Notification['type']
  scope: Notification['scope']
  message: string
  metadata?: Record<string, unknown>
  unread?: boolean
}

/** Push a notification to the store and persist it. */
export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  const notification: Notification = {
    id: newId(),
    userId: input.userId,
    actorId: input.actorId,
    type: input.type,
    scope: input.scope,
    message: input.message,
    unread: input.unread ?? true,
    archived: false,
    metadata: input.metadata,
    createdAt: now(),
  }

  const currentUserId = useAuthStore.getState().currentUserId
  if (usesTasklyticBackend() && currentUserId && input.userId !== currentUserId) {
    await tasklyticApiJson('/actions/deliver-notification', {
      method: 'POST',
      body: JSON.stringify({
        recipientUserId: input.userId,
        notification,
      }),
    })
    return notification
  }

  await useNotificationsStore.getState().add(notification)
  return notification
}

/** Whether a notification is currently snoozed (future snoozedUntil). */
export function isSnoozed(notification: Notification): boolean {
  if (!notification.snoozedUntil) return false
  return new Date(notification.snoozedUntil) > new Date()
}

function isSnoozeExpired(notification: Notification): boolean {
  return Boolean(notification.snoozedUntil && new Date(notification.snoozedUntil) <= new Date())
}

/** Active inbox rows — not archived, not snoozed; newest first. */
export function getActiveInbox(userId: string): Notification[] {
  return useNotificationsStore
    .getState()
    .list()
    .filter((n) => n.userId === userId && !n.archived && !isSnoozed(n))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Snoozed rows still waiting to resurface. */
export function getSnoozedInbox(userId: string): Notification[] {
  return useNotificationsStore
    .getState()
    .list()
    .filter((n) => n.userId === userId && !n.archived && isSnoozed(n))
    .sort((a, b) => (a.snoozedUntil ?? '').localeCompare(b.snoozedUntil ?? ''))
}

/** Archived rows for the archive view. */
export function getArchivedInbox(userId: string): Notification[] {
  return useNotificationsStore
    .getState()
    .list()
    .filter((n) => n.userId === userId && n.archived)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Count of unread, non-archived, non-snoozed notifications. */
export function getUnreadCount(userId: string): number {
  return getActiveInbox(userId).filter((n) => n.unread).length
}

/** Mark one notification read. */
export async function markRead(id: string): Promise<void> {
  await useNotificationsStore.getState().update(id, { unread: false })
}

/** Mark one notification unread. */
export async function markUnread(id: string): Promise<void> {
  await useNotificationsStore.getState().update(id, { unread: true })
}

/** Mark every active inbox notification read for a user. */
export async function markAllRead(userId: string): Promise<void> {
  const store = useNotificationsStore.getState()
  const targets = getActiveInbox(userId).filter((n) => n.unread)
  await Promise.all(targets.map((n) => store.update(n.id, { unread: false })))
}

/** Archive one notification and clear snooze. */
export async function archive(id: string): Promise<void> {
  await useNotificationsStore.getState().update(id, {
    archived: true,
    unread: false,
    snoozedUntil: undefined,
  })
}

/** Archive every read notification in the active inbox. */
export async function archiveAllRead(userId: string): Promise<void> {
  const store = useNotificationsStore.getState()
  const targets = getActiveInbox(userId).filter((n) => !n.unread)
  await Promise.all(
    targets.map((n) => store.update(n.id, { archived: true, snoozedUntil: undefined }))
  )
}

/** Snooze until a future ISO datetime. */
export async function snooze(id: string, until: string): Promise<void> {
  await useNotificationsStore.getState().update(id, { snoozedUntil: until })
}

/** Clear snooze and leave in the active inbox. */
export async function unsnooze(id: string): Promise<void> {
  await useNotificationsStore.getState().update(id, { snoozedUntil: undefined })
}

/** Resurface expired snoozes as unread. Call on inbox mount / tick. */
export async function refreshExpiredSnoozes(userId: string): Promise<void> {
  const store = useNotificationsStore.getState()
  const expired = store
    .list()
    .filter((n) => n.userId === userId && !n.archived && isSnoozeExpired(n))
  await Promise.all(
    expired.map((n) => store.update(n.id, { snoozedUntil: undefined, unread: true }))
  )
}

/** Snooze preset: later today at 4pm local (rolls to tomorrow if past). */
export function snoozePresetLaterToday(): string {
  const d = new Date()
  d.setHours(16, 0, 0, 0)
  if (d <= new Date()) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

/** Snooze preset: tomorrow at 9am local. */
export function snoozePresetTomorrow(): string {
  return setMinutes(setHours(startOfTomorrow(), 9), 0).toISOString()
}

/** Snooze preset: one week from now. */
export function snoozePresetNextWeek(): string {
  return addDays(new Date(), 7).toISOString()
}

/** Notify assignee when a task is assigned to them. */
export async function notifyTaskAssigned(
  taskId: string,
  assigneeId: string,
  actorId: string
): Promise<void> {
  if (!assigneeId || assigneeId === actorId) return
  const task = useTasksStore.getState().getById(taskId)
  if (!task) return
  const actor = useUsersStore.getState().getById(actorId)
  await createNotification({
    userId: assigneeId,
    actorId,
    type: 'assigned',
    scope: { type: 'task', id: taskId },
    message: `${actor?.name ?? 'Someone'} assigned you a task`,
    metadata: { taskName: task.name, projectId: task.projectIds[0] },
  })
}

/** Notify user when @mentioned (step 18 composer calls this). */
export async function notifyMention(
  userId: string,
  actorId: string,
  scope: Notification['scope'],
  contextLabel: string
): Promise<void> {
  if (userId === actorId) return
  const actor = useUsersStore.getState().getById(actorId)
  await createNotification({
    userId,
    actorId,
    type: 'mention',
    scope,
    message: `${actor?.name ?? 'Someone'} mentioned you in ${contextLabel}`,
    metadata: { contextLabel },
  })
}

/** Notify assignee or followers that a task is due within 24h (at most once per task per day). */
export async function notifyDueSoon(taskId: string, userId: string): Promise<void> {
  const task = useTasksStore.getState().getById(taskId)
  if (!task) return
  const dayKey = new Date().toISOString().slice(0, 10)
  const store = useNotificationsStore.getState()
  const dup = store
    .list()
    .some(
      (n) =>
        n.userId === userId &&
        n.type === 'due_soon' &&
        n.scope.type === 'task' &&
        n.scope.id === taskId &&
        n.createdAt.slice(0, 10) === dayKey
    )
  if (dup) return
  await createNotification({
    userId,
    type: 'due_soon',
    scope: { type: 'task', id: taskId },
    message: `"${task.name}" is due soon`,
    metadata: { taskName: task.name, dueOn: task.dueOn },
  })
}

/** Notify project members of a status update. */
export async function notifyStatusUpdate(
  userId: string,
  actorId: string,
  projectId: string,
  statusLabel: string,
  updateId: string
): Promise<void> {
  const project = useProjectsStore.getState().getById(projectId)
  const actor = useUsersStore.getState().getById(actorId)
  await createNotification({
    userId,
    actorId,
    type: 'status_update',
    scope: { type: 'project', id: projectId },
    message: `${actor?.name ?? 'Someone'} posted a status update: ${statusLabel} on ${project?.name ?? 'project'}`,
    metadata: { updateId, statusLabel, subtype: 'status_update' },
  })
}

/** Notify a user about a project message announcement. */
export async function notifyProjectMessage(
  userId: string,
  actorId: string,
  projectId: string,
  messageId: string,
  title: string
): Promise<void> {
  const project = useProjectsStore.getState().getById(projectId)
  const actor = useUsersStore.getState().getById(actorId)
  await createNotification({
    userId,
    actorId,
    type: 'project_message',
    scope: { type: 'project', id: projectId },
    message: `${actor?.name ?? 'Someone'} posted "${title}" in ${project?.name ?? 'project'}`,
    metadata: { messageId, subtype: 'project_message' },
  })
}

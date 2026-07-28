/**
 * Comment mutations — add, edit, delete, reactions, pin; emit activity and notifications.
 */
import { emitActivity } from './activity'
import { newId } from './ids'
import { sanitizeHtml } from './sanitizeHtml'
import { addFollower } from './taskActions'
import { now } from './time'
import type { Comment } from '../types'
import {
  useCommentsStore,
  useNotificationsStore,
  useProjectsStore,
  useTasksStore,
} from '../stores/entities'

const DEFAULT_REACTIONS: Comment['reactions'] = {}

/** Extract user ids from mention spans in HTML. */
export function extractMentionedUserIds(html: string): string[] {
  const ids: string[] = []
  const re = /data-mention-user-id="([^"]+)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1])
  }
  return ids
}

/** Extract special mention tokens (@assignee, @followers, @here). */
export function extractMentionTokens(html: string): Array<'assignee' | 'followers' | 'here'> {
  const tokens: Array<'assignee' | 'followers' | 'here'> = []
  const re = /data-mention-token="(assignee|followers|here)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    const token = match[1] as 'assignee' | 'followers' | 'here'
    if (!tokens.includes(token)) tokens.push(token)
  }
  return tokens
}

/** Parse @mention tokens from plain text into HTML pills and user ids. */
export function parseMentions(
  text: string,
  userNames: Map<string, { id: string; name: string; color: string }>
): { bodyHtml: string; mentionedUserIds: string[] } {
  const mentionedUserIds: string[] = []
  const byName = new Map<string, { id: string; name: string; color: string }>()
  userNames.forEach((u) => byName.set(u.name.toLowerCase(), u))
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const bodyHtml = escaped.replace(/@([\w\s.-]+)/g, (match, name: string) => {
    const user = byName.get(name.trim().toLowerCase())
    if (!user) return match
    if (!mentionedUserIds.includes(user.id)) mentionedUserIds.push(user.id)
    return `<span data-mention-user-id="${user.id}" contenteditable="false" style="color:${user.color};font-weight:600">@${user.name}</span>`
  })
  return { bodyHtml: sanitizeHtml(`<p>${bodyHtml.replace(/\n/g, '<br/>')}</p>`), mentionedUserIds }
}

/** Parent comment id encoded in reply wrapper, if any. */
export function getReplyParentId(bodyHtml: string): string | null {
  return bodyHtml.match(/data-reply-to="([^"]+)"/)?.[1] ?? null
}

/** Count comments on a task. */
export function getTaskCommentCount(taskId: string): number {
  return useCommentsStore.getState().list().filter((c) => c.taskId === taskId).length
}

async function pushNotification(
  userId: string,
  authorId: string,
  taskId: string,
  type: 'mention' | 'comment_on_task',
  message: string
): Promise<void> {
  await useNotificationsStore.getState().add({
    id: newId(),
    userId,
    actorId: authorId,
    type,
    scope: { type: 'task', id: taskId },
    message,
    unread: true,
    archived: false,
    createdAt: now(),
  })
}

async function wireCommentNotifications(
  taskId: string,
  authorId: string,
  bodyHtml: string,
  mentionedUserIds: string[]
): Promise<void> {
  const task = useTasksStore.getState().getById(taskId)
  if (!task) return
  const notifyIds = new Set<string>()
  for (const userId of mentionedUserIds) {
    if (userId === authorId) continue
    notifyIds.add(userId)
    if (!task.collaboratorIds.includes(userId)) await addFollower(taskId, userId, authorId)
  }
  for (const token of extractMentionTokens(bodyHtml)) {
    if (token === 'assignee' && task.assigneeId && task.assigneeId !== authorId) notifyIds.add(task.assigneeId)
    if (token === 'followers') task.collaboratorIds.forEach((id) => id !== authorId && notifyIds.add(id))
    if (token === 'here' && task.projectIds[0]) {
      useProjectsStore.getState().getById(task.projectIds[0])?.memberIds.forEach((id) => id !== authorId && notifyIds.add(id))
    }
  }
  for (const userId of notifyIds) await pushNotification(userId, authorId, taskId, 'mention', 'mentioned you in a comment')
  const fresh = useTasksStore.getState().getById(taskId)
  if (!fresh) return
  for (const userId of fresh.collaboratorIds) {
    if (userId === authorId || notifyIds.has(userId)) continue
    await pushNotification(userId, authorId, taskId, 'comment_on_task', `commented on "${fresh.name}"`)
  }
}

/** Add a comment to a task and emit a comment_added activity event. */
export async function addComment(
  taskId: string,
  authorId: string,
  bodyHtml: string,
  mentionedUserIds: string[] = [],
  replyToId?: string
): Promise<Comment> {
  let sanitized = sanitizeHtml(bodyHtml)
  if (replyToId) sanitized = `<div data-reply-to="${replyToId}">${sanitized}</div>`
  const mergedMentions = [...new Set([...mentionedUserIds, ...extractMentionedUserIds(sanitized)])]
  const comment: Comment = {
    id: newId(),
    taskId,
    authorId,
    bodyHtml: sanitized,
    mentionedUserIds: mergedMentions,
    attachmentIds: [],
    reactions: { ...DEFAULT_REACTIONS },
    isPinned: false,
    createdAt: now(),
  }
  await useCommentsStore.getState().add(comment)
  emitActivity({ taskId, actorId: authorId, type: 'comment_added', details: { commentId: comment.id } })
  await wireCommentNotifications(taskId, authorId, sanitized, mergedMentions)
  return comment
}

/** Update comment body (author only). */
export async function updateComment(commentId: string, bodyHtml: string, mentionedUserIds: string[]): Promise<void> {
  const sanitized = sanitizeHtml(bodyHtml)
  const mergedMentions = [...new Set([...mentionedUserIds, ...extractMentionedUserIds(sanitized)])]
  if (!useCommentsStore.getState().getById(commentId)) return
  await useCommentsStore.getState().update(commentId, {
    bodyHtml: sanitized,
    mentionedUserIds: mergedMentions,
    editedAt: now(),
  })
}

export async function deleteComment(commentId: string): Promise<void> {
  await useCommentsStore.getState().remove(commentId)
}

export async function togglePinComment(commentId: string): Promise<void> {
  const comment = useCommentsStore.getState().getById(commentId)
  if (!comment) return
  await useCommentsStore.getState().update(commentId, { isPinned: !comment.isPinned })
}

export async function toggleCommentReaction(commentId: string, emoji: string, userId: string): Promise<void> {
  const comment = useCommentsStore.getState().getById(commentId)
  if (!comment) return
  const reactions = { ...comment.reactions }
  const users = [...(reactions[emoji] ?? [])]
  const idx = users.indexOf(userId)
  if (idx >= 0) users.splice(idx, 1)
  else users.push(userId)
  if (users.length) reactions[emoji] = users
  else delete reactions[emoji]
  await useCommentsStore.getState().update(commentId, { reactions })
}

/**
 * Project message mutations — create, comment, react, and notify audience.
 */
import { extractMentionedUserIds } from './comments'
import { newId } from './ids'
import { notifyMention, notifyProjectMessage } from './notifications'
import { sanitizeHtml } from './sanitizeHtml'
import { now } from './time'
import type { ProjectMessage, ProjectMessageComment } from '../types'
import { useProjectMessagesStore, useProjectsStore } from '../stores/entities'

const EMPTY_REACTIONS: Record<string, string[]> = {}

export type CreateProjectMessageInput = {
  projectId: string
  authorId: string
  title: string
  bodyHtml: string
  isAnnouncement?: boolean
  audienceIds?: string[]
}

/** Build a shareable URL that opens this message in the Messages tab. */
export function projectMessagePermalink(basePath: string, messageId: string): string {
  const join = basePath.includes('?') ? '&' : '?'
  return `${basePath}${join}view=messages&messageId=${messageId}`
}

/** Post a new project message and notify the audience. */
export async function createProjectMessage(input: CreateProjectMessageInput): Promise<ProjectMessage> {
  const sanitized = sanitizeHtml(input.bodyHtml)
  const mentioned = extractMentionedUserIds(sanitized)
  const message: ProjectMessage = {
    id: newId(),
    projectId: input.projectId,
    authorId: input.authorId,
    recipientType: 'project_members',
    audienceIds: input.audienceIds ?? [],
    title: input.title.trim(),
    bodyHtml: sanitized,
    isAnnouncement: input.isAnnouncement ?? false,
    attachmentIds: [],
    reactions: { ...EMPTY_REACTIONS },
    comments: [],
    createdAt: now(),
  }

  await useProjectMessagesStore.getState().add(message)
  await notifyMessageAudience(message, input.authorId, mentioned)
  return message
}

async function notifyMessageAudience(
  message: ProjectMessage,
  authorId: string,
  mentionedIds: string[]
): Promise<void> {
  const project = useProjectsStore.getState().getById(message.projectId)
  const recipients = new Set<string>(project?.memberIds ?? [])
  message.audienceIds.forEach((id) => recipients.add(id))
  mentionedIds.forEach((id) => recipients.add(id))
  if (!message.isAnnouncement) {
    recipients.delete(authorId)
  }

  const scope = { type: 'project' as const, id: message.projectId }
  await Promise.all(
    [...recipients].map(async (userId) => {
      if (mentionedIds.includes(userId)) {
        await notifyMention(userId, authorId, scope, `project message "${message.title}"`)
        return
      }
      if (message.isAnnouncement) {
        await notifyProjectMessage(userId, authorId, message.projectId, message.id, message.title)
      }
    })
  )
}

/** Append a comment to a project message thread. */
export async function addProjectMessageComment(
  messageId: string,
  authorId: string,
  bodyHtml: string,
  mentionedUserIds: string[] = []
): Promise<ProjectMessageComment | undefined> {
  const store = useProjectMessagesStore.getState()
  const message = store.getById(messageId)
  if (!message) return undefined

  const sanitized = sanitizeHtml(bodyHtml)
  const merged = [...new Set([...mentionedUserIds, ...extractMentionedUserIds(sanitized)])]
  const comment: ProjectMessageComment = {
    id: newId(),
    authorId,
    bodyHtml: sanitized,
    mentionedUserIds: merged,
    attachmentIds: [],
    reactions: { ...EMPTY_REACTIONS },
    isPinned: false,
    createdAt: now(),
  }

  await store.update(messageId, { comments: [...message.comments, comment] })
  const scope = { type: 'project' as const, id: message.projectId }
  await Promise.all(
    merged
      .filter((id) => id !== authorId)
      .map((userId) => notifyMention(userId, authorId, scope, `message "${message.title}"`))
  )
  return comment
}

function toggleReaction(
  reactions: Record<string, string[]>,
  emoji: string,
  userId: string
): Record<string, string[]> {
  const next = { ...reactions }
  const users = [...(next[emoji] ?? [])]
  const idx = users.indexOf(userId)
  if (idx >= 0) users.splice(idx, 1)
  else users.push(userId)
  if (users.length) next[emoji] = users
  else delete next[emoji]
  return next
}

/** Toggle an emoji reaction on a project message. */
export async function toggleProjectMessageReaction(
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  const message = useProjectMessagesStore.getState().getById(messageId)
  if (!message) return
  await useProjectMessagesStore.getState().update(messageId, {
    reactions: toggleReaction(message.reactions, emoji, userId),
  })
}

/** Toggle an emoji reaction on a message comment. */
export async function toggleProjectMessageCommentReaction(
  messageId: string,
  commentId: string,
  emoji: string,
  userId: string
): Promise<void> {
  const store = useProjectMessagesStore.getState()
  const message = store.getById(messageId)
  if (!message) return
  const comments = message.comments.map((c) =>
    c.id === commentId
      ? { ...c, reactions: toggleReaction(c.reactions, emoji, userId) }
      : c
  )
  await store.update(messageId, { comments })
}

export type UpdateProjectMessageInput = {
  messageId: string
  authorId: string
  title: string
  bodyHtml: string
  isAnnouncement?: boolean
}

/** Update an existing project message (author only). Does not re-send notifications. */
export async function updateProjectMessage(input: UpdateProjectMessageInput): Promise<ProjectMessage | undefined> {
  const store = useProjectMessagesStore.getState()
  const existing = store.getById(input.messageId)
  if (!existing || existing.authorId !== input.authorId) return undefined

  const sanitized = sanitizeHtml(input.bodyHtml)
  await store.update(input.messageId, {
    title: input.title.trim(),
    bodyHtml: sanitized,
    isAnnouncement: input.isAnnouncement ?? existing.isAnnouncement,
    editedAt: now(),
  })
  return store.getById(input.messageId)
}

/** Delete a project message (author only). */
export async function deleteProjectMessage(messageId: string, actorId: string): Promise<boolean> {
  const store = useProjectMessagesStore.getState()
  const existing = store.getById(messageId)
  if (!existing || existing.authorId !== actorId) return false
  await store.remove(messageId)
  return true
}

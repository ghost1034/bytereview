'use client'

import { format } from 'date-fns'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import { formatRelative } from '../../lib/time'
import { toggleProjectMessageCommentReaction } from '../../lib/projectMessages'
import type { ProjectMessageComment, User } from '../../types'
import { MessageReactions } from './MessageReactions'

type Props = {
  messageId: string
  comment: ProjectMessageComment
  author?: User
  userById: Map<string, User>
  workspaceUsers: User[]
  currentUserId: string
}

/** Single comment row in a project message thread. */
export function MessageCommentRow({
  messageId,
  comment,
  author,
  userById,
  workspaceUsers,
  currentUserId,
}: Props) {
  const onReaction = (emoji: string) => {
    void toggleProjectMessageCommentReaction(messageId, comment.id, emoji, currentUserId)
  }

  return (
    <article className="rounded-lg p-3 text-sm" style={{ background: 'var(--bg-muted)' }}>
      <div className="mb-1 flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: author?.avatarColor ?? 'var(--primary)' }}
        >
          {(author?.name ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="font-medium">{author?.name ?? 'Unknown'}</span>
        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          {formatRelative(comment.createdAt)}
        </span>
      </div>
      <div
        className="leading-relaxed"
        style={{ color: 'var(--ink-secondary)' }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(comment.bodyHtml) }}
      />
      <MessageReactions
        reactions={comment.reactions}
        currentUserId={currentUserId}
        userById={userById}
        onToggle={onReaction}
      />
    </article>
  )
}

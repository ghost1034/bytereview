'use client'

/**
 * CommentThread — pinned-first threaded list (single-level replies).
 */
import { useMemo } from 'react'
import { getReplyParentId } from '../../../lib/comments'
import { useCommentsStore } from '../../../stores/entities'
import type { Comment, Task, User } from '../../../types'
import { CommentRow } from './CommentRow'

type Props = {
  task: Task
  userById: Map<string, User>
  workspaceUsers: User[]
}

/** Ordered comment thread with nested replies. */
export function CommentThread({ task, userById, workspaceUsers }: Props) {
  const comments = useCommentsStore((s) =>
    s
      .list()
      .filter((c) => c.taskId === task.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  )

  const { roots, repliesByParent } = useMemo(() => {
    const roots: Comment[] = []
    const repliesByParent = new Map<string, Comment[]>()
    comments.forEach((c) => {
      const parentId = getReplyParentId(c.bodyHtml)
      if (parentId) {
        const list = repliesByParent.get(parentId) ?? []
        list.push(c)
        repliesByParent.set(parentId, list)
      } else {
        roots.push(c)
      }
    })
    roots.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return a.createdAt.localeCompare(b.createdAt)
    })
    return { roots, repliesByParent }
  }, [comments])

  if (!roots.length) {
    return (
      <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        No comments yet. Start the conversation.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {roots.map((comment) => (
        <div key={comment.id} className="space-y-3">
          <CommentRow
            comment={comment}
            task={task}
            author={userById.get(comment.authorId)}
            userById={userById}
            workspaceUsers={workspaceUsers}
          />
          {(repliesByParent.get(comment.id) ?? []).map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              task={task}
              author={userById.get(reply.authorId)}
              userById={userById}
              workspaceUsers={workspaceUsers}
              nested
            />
          ))}
        </div>
      ))}
    </div>
  )
}

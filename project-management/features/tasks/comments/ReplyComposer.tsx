'use client'

/**
 * ReplyComposer — inline reply under a parent comment.
 */
import type { Comment, Task, User } from '../../../types'
import { CommentComposer } from './CommentComposer'

type Props = {
  task: Task
  parent: Comment
  workspaceUsers: User[]
  onClose: () => void
}

/** Compact reply composer nested under a comment. */
export function ReplyComposer({ task, parent, workspaceUsers, onClose }: Props) {
  return (
    <div className="mt-2 border-l-2 pl-3" style={{ borderColor: 'hsl(var(--border))' }}>
      <CommentComposer
        task={task}
        workspaceUsers={workspaceUsers}
        replyToId={parent.id}
        compact
        onPosted={onClose}
      />
    </div>
  )
}

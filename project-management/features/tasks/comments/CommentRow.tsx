'use client'

/**
 * CommentRow — single comment paper card with actions, reactions, and reply.
 */
import { useRef, useState } from 'react'
import { format } from 'date-fns'
import { MessageSquareReply, Pin, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  deleteComment,
  extractMentionedUserIds,
  getReplyParentId,
  toggleCommentReaction,
  togglePinComment,
  updateComment,
} from '../../../lib/comments'
import { sanitizeHtml } from '../../../lib/sanitizeHtml'
import { formatRelative } from '../../../lib/time'
import { useAuthStore } from '../../../stores/auth'
import type { Comment, Task, User } from '../../../types'
import { CommentComposer } from './CommentComposer'
import { ReactionRow } from './ReactionRow'

type EditBoxProps = {
  initialHtml: string
  onSave: (html: string) => void
  onCancel: () => void
}

function EditBox({ initialHtml, onSave, onCancel }: EditBoxProps) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className="space-y-2">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="min-h-16 rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))' }}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
      />
      <div className="flex gap-2">
        <Button size="sm" className="tl-btn-primary border-0" onClick={() => onSave(ref.current?.innerHTML ?? '')}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

type Props = {
  comment: Comment
  task: Task
  author?: User
  userById: Map<string, User>
  workspaceUsers: User[]
  nested?: boolean
}

function stripReplyWrapper(html: string): string {
  return html.replace(/^<div data-reply-to="[^"]+">([\s\S]*)<\/div>$/i, '$1')
}

/** One comment card in the thread. */
export function CommentRow({ comment, task, author, userById, workspaceUsers, nested }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [editing, setEditing] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const isOwn = currentUserId === comment.authorId
  const bodyHtml = sanitizeHtml(stripReplyWrapper(comment.bodyHtml))

  const onReaction = (emoji: string) => {
    if (!currentUserId) return
    void toggleCommentReaction(comment.id, emoji, currentUserId)
  }

  const onDelete = async () => {
    if (!window.confirm('Delete this comment?')) return
    await deleteComment(comment.id)
  }

  const onPin = () => void togglePinComment(comment.id)

  const saveEdit = async (html: string) => {
    if (!currentUserId || !html.trim()) return
    const sanitized = sanitizeHtml(html)
    await updateComment(comment.id, sanitized, extractMentionedUserIds(sanitized))
    setEditing(false)
  }

  return (
    <article
      tabIndex={0}
      className={`rounded-lg p-3 text-sm shadow-sm ${nested ? 'ml-6' : ''}`}
      style={{ background: 'hsl(var(--surface-muted))' }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'r') setReplyOpen(true)
        if (e.key === 'e' && isOwn) setEditing(true)
      }}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ background: author?.avatarColor ?? 'hsl(var(--primary))' }}
        >
          {(author?.name ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="font-medium">{author?.name ?? 'Unknown'}</span>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
                {formatRelative(comment.createdAt)}
                {comment.editedAt ? ` · Edited ${formatRelative(comment.editedAt)}` : ''}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {format(new Date(comment.createdAt), 'PPpp')}
              {comment.editedAt ? ` · edited ${format(new Date(comment.editedAt), 'PPpp')}` : ''}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {comment.isPinned ? (
          <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'hsl(var(--success-soft))', color: 'hsl(var(--success))' }}>
            📌 Pinned
          </span>
        ) : null}
        <span className="ml-auto flex gap-1">
          <button type="button" aria-label="Reply" className="rounded p-1 hover:bg-[hsl(var(--card))]" onClick={() => setReplyOpen((v) => !v)}>
            <MessageSquareReply className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />
          </button>
          <button type="button" aria-label="Pin" className="rounded p-1 hover:bg-[hsl(var(--card))]" onClick={onPin}>
            <Pin className="h-3.5 w-3.5" style={{ color: comment.isPinned ? 'hsl(var(--success))' : 'hsl(var(--foreground-muted))' }} />
          </button>
          {isOwn ? (
            <>
              <button type="button" aria-label="Edit" className="rounded p-1 hover:bg-[hsl(var(--card))]" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />
              </button>
              <button type="button" aria-label="Delete" className="rounded p-1 hover:bg-[hsl(var(--card))]" onClick={() => void onDelete()}>
                <Trash2 className="h-3.5 w-3.5" style={{ color: 'hsl(var(--destructive))' }} />
              </button>
            </>
          ) : null}
        </span>
      </div>

      {editing ? (
        <EditBox initialHtml={bodyHtml} onSave={(html) => void saveEdit(html)} onCancel={() => setEditing(false)} />
      ) : (
        <div
          className="leading-relaxed"
          style={{ color: 'hsl(var(--foreground-muted))' }}
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      )}

      {!editing ? <ReactionRow comment={comment} currentUserId={currentUserId} userById={userById} onToggle={onReaction} /> : null}

      {replyOpen ? (
        <CommentComposer
          task={task}
          workspaceUsers={workspaceUsers}
          replyToId={comment.id}
          compact
          onPosted={() => setReplyOpen(false)}
        />
      ) : null}
    </article>
  )
}

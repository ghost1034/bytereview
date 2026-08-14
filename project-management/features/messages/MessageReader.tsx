'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Link2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import { formatRelative } from '../../lib/time'
import { deleteProjectMessage, projectMessagePermalink, toggleProjectMessageReaction } from '../../lib/projectMessages'
import type { ProjectMessage, User } from '../../types'
import { TasklyticDropdownMenuContent } from '../ui/TasklyticDropdownMenuContent'
import { tasklyticToast } from '../ui/tasklyticToast'
import { MessageCommentComposer } from './MessageCommentComposer'
import { MessageCommentRow } from './MessageCommentRow'
import { MessageReactions } from './MessageReactions'

type Props = {
  message: ProjectMessage
  author?: User
  userById: Map<string, User>
  workspaceUsers: User[]
  currentUserId: string
  basePath: string
  onEdit: () => void
  onDeleted: () => void
}

/** Right pane reader for a selected project message with comments. */
export function MessageReader({
  message,
  author,
  userById,
  workspaceUsers,
  currentUserId,
  basePath,
  onEdit,
  onDeleted,
}: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const canManage = message.authorId === currentUserId

  const sortedComments = useMemo(
    () => [...message.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [message.comments]
  )

  const permalink = useMemo(() => {
    if (typeof window === 'undefined') return projectMessagePermalink(basePath, message.id)
    return `${window.location.origin}${projectMessagePermalink(basePath, message.id)}`
  }, [basePath, message.id])

  const copyPermalink = async () => {
    try {
      await navigator.clipboard.writeText(permalink)
      tasklyticToast('Link copied', { status: 'success', description: 'Share this URL to open this message directly.' })
    } catch {
      tasklyticToast('Could not copy link', { status: 'error' })
    }
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      const ok = await deleteProjectMessage(message.id, currentUserId)
      if (!ok) {
        tasklyticToast('Could not delete message', { status: 'error' })
        return
      }
      tasklyticToast('Message deleted', { status: 'success' })
      setDeleteOpen(false)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <article className="flex h-full flex-col p-4">
      <header className="border-b pb-3" style={{ borderColor: 'hsl(var(--border))' }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="font-sans text-lg">{message.title}</h2>
            <p className="mt-1 text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
              {author?.name ?? 'Unknown'} · {formatRelative(message.createdAt)}
              <span className="ml-2" title={format(new Date(message.createdAt), 'PPpp')}>
                {format(new Date(message.createdAt), 'PP')}
              </span>
              {message.editedAt ? (
                <span className="ml-2" title={format(new Date(message.editedAt), 'PPpp')}>
                  (edited)
                </span>
              ) : null}
            </p>
            {message.isAnnouncement ? (
              <span
                className="mt-2 inline-block rounded px-2 py-0.5 text-xs"
                style={{ background: 'hsl(var(--success-soft))', color: 'hsl(var(--success))' }}
              >
                Announcement
              </span>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Message actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <TasklyticDropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void copyPermalink()}>
                <Link2 className="mr-2 h-4 w-4" /> Copy link
              </DropdownMenuItem>
              {canManage ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </TasklyticDropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div
        className="mt-4 flex-1 text-sm leading-relaxed"
        style={{ color: 'hsl(var(--foreground-muted))' }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.bodyHtml) }}
      />

      <MessageReactions
        reactions={message.reactions}
        currentUserId={currentUserId}
        userById={userById}
        onToggle={(emoji) => void toggleProjectMessageReaction(message.id, emoji, currentUserId)}
      />

      <section className="mt-6 border-t pt-4" style={{ borderColor: 'hsl(var(--border))' }}>
        <h3 className="text-sm font-medium">Comments ({sortedComments.length})</h3>
        <div className="mt-3 space-y-3">
          {sortedComments.map((comment) => (
            <MessageCommentRow
              key={comment.id}
              messageId={message.id}
              comment={comment}
              author={userById.get(comment.authorId)}
              userById={userById}
              workspaceUsers={workspaceUsers}
              currentUserId={currentUserId}
            />
          ))}
        </div>
        <MessageCommentComposer messageId={message.id} authorId={currentUserId} workspaceUsers={workspaceUsers} />
      </section>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the message and its comments permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}

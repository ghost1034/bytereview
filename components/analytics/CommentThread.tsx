'use client'

import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Pencil, Reply, Trash2, X } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  useAnalyticsComments,
  useCreateAnalyticsComment,
  useDeleteAnalyticsComment,
  useUpdateAnalyticsComment,
} from '@/hooks/useAnalyticsComments'
import { useAnalyticsFirm } from '@/hooks/useAnalyticsTeam'
import { useAuth } from '@/contexts/AuthContext'
import type { AnalyticsComment, AnalyticsFirmMember } from '@/lib/analytics/types'

import { MentionInput } from './MentionInput'

interface CommentThreadProps {
  entityType: string
  entityId: string
  className?: string
  /** Limit thread depth; UI keeps things flat past this. */
  maxDepth?: number
}

function memberLookup(members: AnalyticsFirmMember[]): Map<string, AnalyticsFirmMember> {
  const m = new Map<string, AnalyticsFirmMember>()
  for (const member of members) m.set(member.user_id, member)
  return m
}

function CommentAvatar({ member, fallback }: { member: AnalyticsFirmMember | undefined; fallback: string }) {
  return (
    <Avatar className="h-7 w-7">
      {member?.photo_url ? <AvatarImage src={member.photo_url} alt={member.display_name ?? member.email} /> : null}
      <AvatarFallback className="text-xs">{fallback.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  )
}

function renderBodyWithMentions(body: string) {
  // Highlight `@Name` tokens visually. Doesn't link anywhere — the backend
  // already validated the IDs at write time.
  const parts = body.split(/(@[^\s@]+(?:\s[^\s@]+)?)/g)
  return parts.map((p, idx) =>
    p.startsWith('@') ? (
      <span key={idx} className="font-medium text-primary">
        {p}
      </span>
    ) : (
      <React.Fragment key={idx}>{p}</React.Fragment>
    )
  )
}

interface CommentRowProps {
  comment: AnalyticsComment
  members: Map<string, AnalyticsFirmMember>
  currentUserId: string | undefined
  entityType: string
  entityId: string
  depth: number
  maxDepth: number
  onReply: (parentId: string) => void
  replyingTo: string | null
}

function CommentRow({
  comment,
  members,
  currentUserId,
  entityType,
  entityId,
  depth,
  maxDepth,
  onReply,
  replyingTo,
}: CommentRowProps) {
  const update = useUpdateAnalyticsComment(entityType, entityId)
  const remove = useDeleteAnalyticsComment(entityType, entityId)

  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(comment.body)
  const [draftMentions, setDraftMentions] = React.useState<string[]>(comment.mentioned_user_ids ?? [])

  const author = members.get(comment.author_user_id)
  const authorLabel = author?.display_name?.trim() || author?.email || 'Unknown'
  const isOwn = currentUserId === comment.author_user_id

  const saveEdit = () => {
    if (!draft.trim()) return
    update.mutate(
      { commentId: comment.id, data: { body: draft, mentioned_user_ids: draftMentions } },
      { onSuccess: () => setEditing(false) }
    )
  }

  return (
    <div className={cn('flex gap-2', depth > 0 && 'ml-7 mt-2')}>
      <CommentAvatar member={author} fallback={authorLabel} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{authorLabel}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            {comment.updated_at !== comment.created_at ? ' · edited' : ''}
          </span>
        </div>
        {editing ? (
          <div className="mt-1 space-y-2">
            <MentionInput
              value={draft}
              onChange={(body, mentions) => {
                setDraft(body)
                setDraftMentions(mentions)
              }}
              rows={2}
              onSubmit={saveEdit}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={update.isPending || !draft.trim()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(comment.body) }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-sm">{renderBodyWithMentions(comment.body)}</p>
        )}
        {!editing && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            {depth < maxDepth && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-1 text-xs text-muted-foreground"
                onClick={() => onReply(comment.id)}
                disabled={replyingTo === comment.id}
              >
                <Reply className="h-3 w-3" /> Reply
              </Button>
            )}
            {isOwn && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-1 text-xs text-muted-foreground"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-1 text-xs text-destructive"
                  onClick={() => {
                    if (confirm('Delete this comment?')) remove.mutate(comment.id)
                  }}
                  disabled={remove.isPending}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function CommentThread({ entityType, entityId, className, maxDepth = 3 }: CommentThreadProps) {
  const { user } = useAuth()
  const { data: firm } = useAnalyticsFirm()
  const { data, isLoading } = useAnalyticsComments(entityType, entityId)
  const create = useCreateAnalyticsComment()

  const [body, setBody] = React.useState('')
  const [mentions, setMentions] = React.useState<string[]>([])
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null)
  const [replyBody, setReplyBody] = React.useState('')
  const [replyMentions, setReplyMentions] = React.useState<string[]>([])

  const members = React.useMemo(() => memberLookup(firm?.members ?? []), [firm])
  const comments = data?.comments ?? []

  const topLevel = comments.filter((c) => !c.parent_comment_id)
  const repliesByParent = React.useMemo(() => {
    const map = new Map<string, AnalyticsComment[]>()
    for (const c of comments) {
      if (!c.parent_comment_id) continue
      const list = map.get(c.parent_comment_id) ?? []
      list.push(c)
      map.set(c.parent_comment_id, list)
    }
    return map
  }, [comments])

  const submitTopLevel = () => {
    if (!body.trim()) return
    create.mutate(
      { entity_type: entityType, entity_id: entityId, body, mentioned_user_ids: mentions },
      {
        onSuccess: () => {
          setBody('')
          setMentions([])
        },
      }
    )
  }

  const submitReply = (parentId: string) => {
    if (!replyBody.trim()) return
    create.mutate(
      {
        entity_type: entityType,
        entity_id: entityId,
        body: replyBody,
        mentioned_user_ids: replyMentions,
        parent_comment_id: parentId,
      },
      {
        onSuccess: () => {
          setReplyingTo(null)
          setReplyBody('')
          setReplyMentions([])
        },
      }
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-3/4" />
        </div>
      ) : topLevel.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <div className="space-y-3">
          {topLevel.map((c) => (
            <div key={c.id}>
              <CommentRow
                comment={c}
                members={members}
                currentUserId={user?.uid}
                entityType={entityType}
                entityId={entityId}
                depth={0}
                maxDepth={maxDepth}
                onReply={setReplyingTo}
                replyingTo={replyingTo}
              />
              {(repliesByParent.get(c.id) ?? []).map((r) => (
                <CommentRow
                  key={r.id}
                  comment={r}
                  members={members}
                  currentUserId={user?.uid}
                  entityType={entityType}
                  entityId={entityId}
                  depth={1}
                  maxDepth={maxDepth}
                  onReply={setReplyingTo}
                  replyingTo={replyingTo}
                />
              ))}
              {replyingTo === c.id && (
                <div className="ml-7 mt-2 space-y-2">
                  <MentionInput
                    value={replyBody}
                    onChange={(b, m) => {
                      setReplyBody(b)
                      setReplyMentions(m)
                    }}
                    rows={2}
                    placeholder="Reply…"
                    onSubmit={() => submitReply(c.id)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => submitReply(c.id)}
                      disabled={create.isPending || !replyBody.trim()}
                    >
                      Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReplyingTo(null)
                        setReplyBody('')
                        setReplyMentions([])
                      }}
                    >
                      <X className="mr-1 h-3 w-3" /> Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t pt-3">
        <MentionInput
          value={body}
          onChange={(b, m) => {
            setBody(b)
            setMentions(m)
          }}
          rows={2}
          onSubmit={submitTopLevel}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submitTopLevel}
            disabled={create.isPending || !body.trim()}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}

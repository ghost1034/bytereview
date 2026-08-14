'use client'

/**
 * CommentComposer — rich-text composer with @mentions, formatting, and draft persistence.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { addComment, extractMentionedUserIds } from '../../../lib/comments'
import { sanitizeHtml } from '../../../lib/sanitizeHtml'
import { useAuthStore } from '../../../stores/auth'
import type { Task, User } from '../../../types'
import { useCommentDraftStore } from './commentDraftStore'
import { ComposerToolbar } from './ComposerToolbar'
import { MentionPicker, type MentionPick } from './MentionPicker'

type Props = {
  task: Task
  workspaceUsers: User[]
  replyToId?: string
  onPosted?: () => void
  compact?: boolean
}

/** Top-level or reply comment composer. */
export function CommentComposer({ task, workspaceUsers, replyToId, onPosted, compact }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const editorRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const getDraft = useCommentDraftStore((s) => s.getDraft)
  const setDraft = useCommentDraftStore((s) => s.setDraft)
  const clearDraft = useCommentDraftStore((s) => s.clearDraft)

  useEffect(() => {
    if (!currentUserId || !editorRef.current || replyToId) return
    const saved = getDraft(currentUserId, task.id)
    if (saved) editorRef.current.innerHTML = saved
  }, [currentUserId, getDraft, replyToId, task.id])

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  const scheduleDraftSave = useCallback(() => {
    if (!currentUserId || replyToId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setDraft(currentUserId, task.id, editorRef.current?.innerHTML ?? '')
    }, 800)
  }, [currentUserId, replyToId, setDraft, task.id])

  const detectMention = () => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return setMentionQuery(null)
    const node = sel.getRangeAt(0).startContainer
    if (node.nodeType !== Node.TEXT_NODE) return setMentionQuery(null)
    const before = (node.textContent ?? '').slice(0, sel.getRangeAt(0).startOffset)
    const atMatch = before.match(/@([\w\s.-]*)$/)
    setMentionQuery(atMatch ? atMatch[1] : null)
  }

  const insertMention = (pick: MentionPick) => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return
    const text = node.textContent ?? ''
    const atIdx = text.slice(0, range.startOffset).lastIndexOf('@')
    if (atIdx < 0) return

    const span = document.createElement('span')
    span.contentEditable = 'false'
    if (pick.kind === 'user') {
      span.dataset.mentionUserId = pick.user.id
      span.style.cssText = `color:${pick.user.avatarColor};font-weight:600`
      span.textContent = `@${pick.user.name}`
    } else {
      span.dataset.mentionToken = pick.token
      span.style.cssText = 'color:hsl(var(--success));font-weight:600'
      span.textContent = pick.label
    }

    const after = text.slice(range.startOffset)
    node.textContent = text.slice(0, atIdx)
    const parent = node.parentNode
    if (!parent) return
    parent.insertBefore(span, node.nextSibling)
    const space = document.createTextNode(` ${after}`)
    parent.insertBefore(space, span.nextSibling)
    sel.collapse(space, 1)
    setMentionQuery(null)
    scheduleDraftSave()
  }

  const submit = async () => {
    if (!currentUserId || !editorRef.current) return
    const raw = editorRef.current.innerHTML.trim()
    if (!raw) return
    setSubmitting(true)
    try {
      const bodyHtml = sanitizeHtml(raw)
      await addComment(task.id, currentUserId, bodyHtml, extractMentionedUserIds(bodyHtml), replyToId)
      editorRef.current.innerHTML = ''
      if (!replyToId) clearDraft(currentUserId, task.id)
      onPosted?.()
    } finally {
      setSubmitting(false)
    }
  }

  const hasDraft = Boolean(currentUserId && !replyToId && getDraft(currentUserId, task.id))

  return (
    <div className="space-y-2">
      {!compact ? <ComposerToolbar onExec={exec} /> : null}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className={`rounded-lg border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${compact ? 'min-h-16' : 'min-h-20 rounded-t-none'}`}
          style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--card))', color: 'hsl(var(--foreground-muted))' }}
          data-placeholder="Write a comment… (@ to mention)"
          onInput={() => {
            detectMention()
            scheduleDraftSave()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit()
            }
            if (e.key === 'Escape') setMentionQuery(null)
          }}
        />
        {mentionQuery !== null ? (
          <MentionPicker users={workspaceUsers} query={mentionQuery} onPick={insertMention} />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        {hasDraft ? (
          <button type="button" className="text-xs underline" style={{ color: 'hsl(var(--foreground-muted))' }} onClick={() => {
            if (!currentUserId) return
            clearDraft(currentUserId, task.id)
            if (editorRef.current) editorRef.current.innerHTML = ''
          }}>
            Discard draft
          </button>
        ) : (
          <span />
        )}
        <Button size="sm" className="tl-btn-primary border-0" disabled={submitting} onClick={() => void submit()}>
          {replyToId ? 'Reply' : 'Post comment'}
        </Button>
      </div>
    </div>
  )
}

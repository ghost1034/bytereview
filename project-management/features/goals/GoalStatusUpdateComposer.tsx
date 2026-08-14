'use client'

/** Goal status update composer and history (scope: goal). */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { postGoalStatusUpdate } from '../../lib/goals/goalActions'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import type { Goal, StatusUpdate } from '../../types'
import { useStatusUpdatesStore, useUsersStore } from '../../stores/entities'
import { StatusUpdateCard } from '../status/StatusUpdateCard'
import { StatusSegmentPicker } from '../status/StatusSegmentPicker'

type Props = {
  goal: Goal
  currentUserId: string
}

function wrapHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return sanitizeHtml(trimmed.startsWith('<') ? trimmed : `<p>${trimmed}</p>`)
}

/** Composer + timeline for goal-scoped status updates. */
export function GoalStatusUpdateComposer({ goal, currentUserId }: Props) {
  const users = useUsersStore((s) => s.list())
  const updates = useStatusUpdatesStore((s) =>
    s
      .list()
      .filter((u) => u.scope.type === 'goal' && u.scope.id === goal.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  )
  const latest = updates[0]
  const [status, setStatus] = useState<StatusUpdate['status']>('on_track')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(!latest)

  const defaultTitle = useMemo(
    () => `Goal update — ${goal.name}`,
    [goal.name]
  )

  const submit = async () => {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    try {
      await postGoalStatusUpdate({
        goalId: goal.id,
        authorId: currentUserId,
        status,
        title: title || defaultTitle,
        summaryHtml: wrapHtml(summary) || '<p>Status update posted.</p>',
      })
      setSummary('')
      setTitle('')
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {latest && !showForm ? (
        <div>
          <StatusUpdateCard update={latest} author={users.find((u) => u.id === latest.authorId)} compact />
          <Button variant="link" size="sm" className="mt-2 px-0" onClick={() => setShowForm(true)}>
            Post new update
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg p-3" style={{ background: 'hsl(var(--surface-muted))' }}>
          <div className="space-y-2">
            <Label>Status</Label>
            <StatusSegmentPicker value={status} onChange={setStatus} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-update-title">Title</Label>
            <Input
              id="goal-update-title"
              className="tl-input"
              placeholder={defaultTitle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-update-summary">Summary</Label>
            <textarea
              id="goal-update-summary"
              className="tl-input min-h-[80px] w-full rounded-md border p-2 text-sm"
              placeholder="What's changed?"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {latest ? (
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            ) : null}
            <Button className="tl-btn-primary border-0" size="sm" disabled={submitting} onClick={() => void submit()}>
              Post update
            </Button>
          </div>
        </div>
      )}
      {updates.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>History</p>
          {updates.slice(1).map((u) => (
            <StatusUpdateCard key={u.id} update={u} author={users.find((x) => x.id === u.authorId)} compact />
          ))}
        </div>
      ) : null}
    </div>
  )
}

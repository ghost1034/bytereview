'use client'

/**
 * TaskDescriptionEditor — rich notes with autosave, read mode, and expand/collapse.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sanitizeHtml } from '../../lib/sanitizeHtml'
import { updateNotes } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import type { Task } from '../../types'
import { RichTextEditor } from '../richtext/RichTextEditor'

type Props = {
  task: Task
  /** Step 18 binds real @mention handler; reserved for future RichTextEditor integration. */
  onMention?: (query: string) => void
}

const COLLAPSED_MAX = 280

/** Task description with debounced autosave and sanitized read view. */
export function TaskDescriptionEditor({ task, onMention: _onMention }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [html, setHtml] = useState(task.notes ?? '')
  const savedHtml = useRef(task.notes ?? '')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setHtml(task.notes ?? '')
    savedHtml.current = task.notes ?? ''
  }, [task.id, task.notes])

  const scheduleSave = useCallback(
    (next: string) => {
      if (!currentUserId) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void (async () => {
          const sanitized = sanitizeHtml(next)
          if (sanitized === savedHtml.current) return
          savedHtml.current = sanitized
          await updateNotes(task.id, sanitized, currentUserId)
        })()
      }, 600)
    },
    [currentUserId, task.id],
  )

  const onChange = useCallback(
    (next: string) => {
      setHtml(next)
      scheduleSave(next)
    },
    [scheduleSave],
  )

  const sanitized = sanitizeHtml(html)
  const plainLength = sanitized.replace(/<[^>]+>/g, '').length
  const isLong = plainLength > COLLAPSED_MAX
  const showCollapsed = !editing && isLong && !expanded

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
          Description
        </p>
        {!editing ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
        ) : null}
      </div>
      {editing ? (
        <RichTextEditor value={html} onChange={onChange} placeholder="Add a description…" />
      ) : sanitized ? (
        <div
          className="rounded-lg border px-3 py-2 text-sm leading-relaxed tl-task-notes [&_a]:underline"
          style={{
            borderColor: 'hsl(var(--border))',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--foreground-muted))',
            maxHeight: showCollapsed ? '6rem' : undefined,
            overflow: showCollapsed ? 'hidden' : undefined,
          }}
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      ) : (
        <button
          type="button"
          className="w-full rounded-lg border border-dashed px-3 py-6 text-left text-sm"
          style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground-subtle))' }}
          onClick={() => setEditing(true)}
        >
          Add a description…
        </button>
      )}
      {!editing && isLong ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 h-7 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp className="mr-1 h-3 w-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="mr-1 h-3 w-3" /> Show more
            </>
          )}
        </Button>
      ) : null}
      {editing ? (
        <Button type="button" size="sm" variant="outline" className="mt-2 h-8" onClick={() => setEditing(false)}>
          Done
        </Button>
      ) : null}
    </div>
  )
}

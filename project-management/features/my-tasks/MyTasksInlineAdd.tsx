'use client'

/**
 * MyTasksInlineAdd — add a task assigned to the current user in a section.
 */
import { useState } from 'react'
import { createTask } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import { assignTaskToMySection } from './myTasksActions'
import type { MyTasksSectionId } from './types'

type Props = {
  workspaceId: string
  sectionId: MyTasksSectionId
  defaultProjectId?: string
  onDone: () => void
}

/** Inline task creator for My Tasks sections. */
export function MyTasksInlineAdd({ workspaceId, sectionId, defaultProjectId, onDone }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || !currentUserId || saving) return
    setSaving(true)
    try {
      const task = await createTask({
        workspaceId,
        name: trimmed,
        assigneeId: currentUserId,
        projectId: defaultProjectId,
        actorId: currentUserId,
      })
      await assignTaskToMySection(task.id, currentUserId, sectionId, currentUserId)
      setName('')
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void submit()
        if (e.key === 'Escape') onDone()
      }}
      onBlur={() => {
        if (name.trim()) void submit()
        else onDone()
      }}
      placeholder="Write a task name…"
      className="rounded-md border border-input bg-background text-foreground h-8 w-full text-sm"
      autoFocus
      disabled={saving}
    />
  )
}

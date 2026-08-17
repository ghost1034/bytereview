'use client'

/**
 * InlineTaskCreator — rapid inline task add; Enter creates and keeps focus.
 */
import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { createTask } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import { tasklyticToast } from '../ui/tasklyticToast'

type Props = {
  workspaceId: string
  projectId?: string
  sectionId?: string
  placeholder?: string
  onCreated?: (taskId: string) => void
  onCancel?: () => void
}

export function InlineTaskCreator({
  workspaceId,
  projectId,
  sectionId,
  placeholder = 'Add task…',
  onCreated,
  onCancel,
}: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    if (!currentUserId || !name.trim() || busy) return
    setBusy(true)
    try {
      const task = await createTask({
        workspaceId,
        name: name.trim(),
        projectId,
        sectionId,
        actorId: currentUserId,
      })
      setName('')
      onCreated?.(task.id)
      inputRef.current?.focus()
    } catch (error) {
      tasklyticToast('Task could not be created', {
        description: error instanceof Error ? error.message : 'Please try again.',
        status: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Input
      ref={inputRef}
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder={placeholder}
      className="rounded-md border border-input bg-background text-foreground h-8 border-dashed text-sm shadow-none"
      disabled={busy}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
        if (e.key === 'Escape') {
          setName('')
          inputRef.current?.blur()
          onCancel?.()
        }
      }}
      onBlur={() => {
        if (name.trim()) void submit()
        else onCancel?.()
      }}
    />
  )
}

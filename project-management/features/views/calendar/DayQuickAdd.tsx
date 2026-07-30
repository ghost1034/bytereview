'use client'

/** DayQuickAdd — inline task creator prefilled with a due date. */
import { useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { createTask } from '../../../lib/taskActions'
import { useAuthStore } from '../../../stores/auth'

type Props = {
  workspaceId: string
  projectId: string
  dueOn: string
  onDone: () => void
}

export function DayQuickAdd({ workspaceId, projectId, dueOn, onDone }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    if (!currentUserId || !name.trim() || busy) return
    setBusy(true)
    try {
      await createTask({
        workspaceId,
        name: name.trim(),
        projectId,
        dueOn,
        actorId: currentUserId,
      })
      setName('')
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Input
      ref={inputRef}
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      placeholder="Task name…"
      className="tl-input h-7 border-dashed text-xs shadow-none"
      disabled={busy}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
        if (e.key === 'Escape') onDone()
      }}
      onBlur={() => {
        if (name.trim()) void submit()
        else onDone()
      }}
    />
  )
}

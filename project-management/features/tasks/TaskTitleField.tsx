'use client'

/**
 * TaskTitleField — large serif inline-editable task name.
 */
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { renameTask } from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import type { Task } from '../../types'

type Props = { task: Task }

export function TaskTitleField({ task }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(task.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setValue(task.name)
  }, [task.name, editing])

  const save = async () => {
    if (!currentUserId) return
    const ok = await renameTask(task.id, value, currentUserId)
    if (!ok) setValue(task.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mb-4 border-0 px-0 font-sans text-2xl font-medium shadow-none focus-visible:ring-0"
        autoFocus
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') {
            setValue(task.name)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className="mb-4 w-full text-left font-sans text-2xl font-medium leading-tight"
      style={{ color: task.completed ? 'hsl(var(--foreground-muted))' : 'hsl(var(--foreground))' }}
      onClick={() => {
        setEditing(true)
        requestAnimationFrame(() => inputRef.current?.focus())
      }}
    >
      {task.name}
    </button>
  )
}

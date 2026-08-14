'use client'



/**

 * TaskNameCell — name column with subtype, subtasks, and indicators.

 */

import { useEffect, useRef, useState } from 'react'

import {

  ChevronDown,

  ChevronRight,

  Diamond,

  GitBranch,

  MessageSquare,

  Paperclip,

  ShieldCheck,

} from 'lucide-react'

import { Input } from '@/components/ui/input'

import type { Task } from '../../../types'

import { renameTask } from '../../../lib/taskActions'

import { useAuthStore } from '../../../stores/auth'

import { useCommentsStore } from '../../../stores/entities'

import { getSubtaskCounts } from '../../tasks'



type Props = {

  task: Task

  allTasks: Task[]

  depth: number

  expanded: boolean

  onToggleExpand: () => void

  onOpenDetail: () => void

}



/** Task name cell with inline rename on double-click. */

export function TaskNameCell({

  task,

  allTasks,

  depth,

  expanded,

  onToggleExpand,

  onOpenDetail,

}: Props) {

  const currentUserId = useAuthStore((s) => s.currentUserId)

  const commentCount = useCommentsStore((s) => s.list().filter((c) => c.taskId === task.id).length)

  const [editing, setEditing] = useState(false)

  const [value, setValue] = useState(task.name)

  const inputRef = useRef<HTMLInputElement>(null)

  const counts = getSubtaskCounts(task.id, allTasks)



  useEffect(() => {

    if (!editing) setValue(task.name)

  }, [task.name, editing])



  const save = async () => {

    if (!currentUserId) return

    const ok = await renameTask(task.id, value, currentUserId)

    if (!ok) setValue(task.name)

    setEditing(false)

  }



  const subtypeIcon =

    task.resourceSubtype === 'milestone' ? (

      <Diamond className="h-3 w-3 shrink-0" style={{ color: 'hsl(var(--info))' }} aria-label="Milestone" />

    ) : task.resourceSubtype === 'approval' ? (

      <ShieldCheck className="h-3 w-3 shrink-0" style={{ color: 'hsl(var(--warning))' }} aria-label="Approval" />

    ) : null



  if (editing) {

    return (

      <Input

        ref={inputRef}

        value={value}

        onChange={(e) => setValue(e.target.value)}

        className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-1"

        autoFocus

        onBlur={() => void save()}

        onKeyDown={(e) => {

          e.stopPropagation()

          if (e.key === 'Enter') void save()

          if (e.key === 'Escape') {

            setValue(task.name)

            setEditing(false)

          }

        }}

        onClick={(e) => e.stopPropagation()}

      />

    )

  }



  return (

    <div

      className="flex min-w-0 items-center gap-1.5"

      style={{ paddingLeft: depth * 16 }}

    >

      {counts.num_subtasks > 0 ? (

        <button

          type="button"

          className="shrink-0 rounded p-0.5 hover:bg-[hsl(var(--surface-muted))]"

          aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}

          onClick={(e) => {

            e.stopPropagation()

            onToggleExpand()

          }}

        >

          {expanded ? (

            <ChevronDown className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />

          ) : (

            <ChevronRight className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />

          )}

        </button>

      ) : (

        <span className="w-4 shrink-0" aria-hidden />

      )}

      {subtypeIcon}

      <button

        type="button"

        className="min-w-0 flex-1 truncate text-left text-sm"

        style={{

          color: task.completed ? 'hsl(var(--foreground-muted))' : 'hsl(var(--foreground))',

          textDecoration: task.completed ? 'line-through' : undefined,

        }}

        onClick={onOpenDetail}

        onDoubleClick={(e) => {

          e.stopPropagation()

          setEditing(true)

          requestAnimationFrame(() => inputRef.current?.focus())

        }}

      >

        {task.name}

      </button>

      <span className="flex shrink-0 items-center gap-1">

        {counts.num_open_subtasks > 0 ? (

          <span className="text-[10px]" style={{ color: 'hsl(var(--foreground-muted))' }} title="Open subtasks">

            {counts.num_open_subtasks}

          </span>

        ) : null}

        {commentCount > 0 ? (

          <MessageSquare className="h-3 w-3" style={{ color: 'hsl(var(--foreground-subtle))' }} aria-label="Comments" />

        ) : null}

        {task.attachmentIds.length > 0 ? (

          <Paperclip className="h-3 w-3" style={{ color: 'hsl(var(--foreground-subtle))' }} aria-label="Attachments" />

        ) : null}

        {task.dependencyIds.length > 0 || task.dependentIds.length > 0 ? (

          <GitBranch className="h-3 w-3" style={{ color: 'hsl(var(--foreground-subtle))' }} aria-label="Dependencies" />

        ) : null}

      </span>

    </div>

  )

}


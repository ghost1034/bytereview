'use client'

/**
 * InlineNewTaskRow — faint add-task row using InlineTaskCreator or createSubtask.
 */
import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Task } from '../../../types'
import { InlineTaskCreator } from '../../tasks/InlineTaskCreator'
import { createSubtask } from '../../../lib/taskActions'
import { useAuthStore } from '../../../stores/auth'
import { canAddSubtask } from '../../tasks'
import { LIST_ROW_HEIGHT } from './listTypes'
import { useProjectsStore, useTemplatesStore } from '../../../stores/entities'
import { instantiateTemplateTasksFromTemplates } from '../../../lib/templates/instantiateTasks'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
  gridTemplate: string
  workspaceId: string
  projectId: string
  sectionId: string
  parentId?: string
  allTasks: Task[]
  placeholder?: string
  faint?: boolean
  forceActive?: boolean
  onCancel?: () => void
}

/** Inline create row — Enter adds and refocuses for rapid entry. */
export function InlineNewTaskRow({
  gridTemplate,
  workspaceId,
  projectId,
  sectionId,
  parentId,
  allTasks,
  placeholder = 'Add task…',
  faint = true,
  forceActive = false,
  onCancel,
}: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const [localActive, setLocalActive] = useState(!faint)
  const [subName, setSubName] = useState('')
  const subRef = useRef<HTMLInputElement>(null)
  const active = forceActive || localActive
  const taskTemplates = useTemplatesStore((state) => state.list().filter((template) => template.taskTemplates.length > 0))
  const project = useProjectsStore((state) => state.getById(projectId))

  const cancel = () => {
    setLocalActive(false)
    onCancel?.()
  }

  if (parentId) {
    if (!canAddSubtask(parentId, allTasks)) return null
    const submitSub = async () => {
      if (!currentUserId || !subName.trim()) return
      const { error } = await createSubtask(parentId, subName.trim(), currentUserId)
      if (!error) {
        setSubName('')
        subRef.current?.focus()
      }
    }
    return (
      <div className="grid items-center border-b px-2" style={{ gridTemplateColumns: gridTemplate, height: LIST_ROW_HEIGHT, borderColor: 'var(--border-subtle)' }}>
        <span />
        <span />
        <div className="col-span-full min-w-0 pl-8">
          <Input
            ref={subRef}
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            placeholder="Add subtask…"
            className="h-7 border-dashed text-sm italic shadow-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submitSub()
              }
              if (e.key === 'Escape') {
                setSubName('')
                subRef.current?.blur()
              }
            }}
          />
        </div>
      </div>
    )
  }

  if (!active) {
    return (
      <button
        type="button"
        className="grid w-full items-center border-b text-left text-sm italic"
        style={{
          gridTemplateColumns: gridTemplate,
          height: LIST_ROW_HEIGHT,
          borderColor: 'var(--border-subtle)',
          color: 'var(--ink-muted)',
        }}
        onClick={() => setLocalActive(true)}
      >
        <span />
        <span />
        <span className="px-2">+ {placeholder}</span>
      </button>
    )
  }

  return (
    <div
      className="grid items-center border-b px-2"
      style={{ gridTemplateColumns: gridTemplate, height: LIST_ROW_HEIGHT, borderColor: 'var(--border-subtle)' }}
    >
      <span />
      <span />
      <div className="col-span-full flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <InlineTaskCreator
            workspaceId={workspaceId}
            projectId={projectId}
            sectionId={sectionId}
            placeholder={placeholder}
            onCancel={cancel}
          />
        </div>
        {currentUserId && taskTemplates.length ? <Select value="" onValueChange={(templateId) => {
          const template = taskTemplates.find((item) => item.id === templateId)
          if (!template || !project) return
          void instantiateTemplateTasksFromTemplates(template.taskTemplates, { workspaceId, projectId, sectionId, ownerId: currentUserId, projectStart: project.startOn ?? new Date().toISOString().slice(0, 10) })
        }}><SelectTrigger className="h-7 w-36 text-xs" aria-label="Create task from template"><SelectValue placeholder="From template" /></SelectTrigger><SelectContent>{taskTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent></Select> : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Cancel add task"
          onClick={cancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

'use client'

/** BoardColumn — section column with droppable card list and collapsed strip. */
import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronRight } from 'lucide-react'
import type { CustomField, Project, Section, Tag, Task, User } from '../../../types'
import { InlineTaskCreator } from '../../tasks'
import { BoardColumnHeader } from './BoardColumnHeader'
import { TaskCard } from './TaskCard'
import { isOverWip } from './boardUtils'

type Props = {
  section: Section
  tasks: Task[]
  project: Project
  basePath: string
  cardFields: CustomField[]
  allFields: CustomField[]
  tags: Tag[]
  users: User[]
  allTasks: Task[]
  density: 'compact' | 'comfortable'
  collapsed: boolean
  autoFocusName?: boolean
  onToggleCollapse: () => void
  onOpenTask: (taskId: string) => void
}

export function BoardColumn({
  section,
  tasks,
  project,
  basePath,
  cardFields,
  allFields,
  tags,
  users,
  allTasks,
  density,
  collapsed,
  autoFocusName,
  onToggleCollapse,
  onOpenTask,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: section.id })
  const [adding, setAdding] = useState(false)
  const overWip = isOverWip(tasks.length, section.wipLimit)
  const wipLabel =
    section.wipLimit != null && section.wipLimit > 0
      ? `${tasks.length}/${section.wipLimit}`
      : String(tasks.length)

  if (collapsed) {
    return (
      <button
        type="button"
        className="flex h-full w-12 shrink-0 flex-col items-center self-stretch rounded-2xl py-3"
        style={{ background: 'hsl(var(--surface-muted))' }}
        onClick={onToggleCollapse}
        title={`Expand ${section.name}`}
      >
        <ChevronRight className="mb-2 h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
        <span
          className="text-xs font-medium [writing-mode:vertical-rl]"
          style={{ color: 'hsl(var(--foreground-muted))' }}
        >
          {section.name}
        </span>
        <span className="mt-2 text-[10px]" style={{ color: overWip ? 'hsl(var(--destructive))' : 'hsl(var(--foreground-muted))' }}>
          {wipLabel}
        </span>
      </button>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 w-72 shrink-0 flex-col rounded-2xl p-2"
      style={{
        background: 'hsl(var(--surface-muted))',
        outline: overWip ? '2px solid hsl(var(--destructive))' : isOver ? '2px solid hsl(var(--primary))' : undefined,
      }}
    >
      <BoardColumnHeader
        section={section}
        taskCount={tasks.length}
        onToggleCollapse={onToggleCollapse}
        onAddTask={() => setAdding(true)}
        autoFocusName={autoFocusName}
      />
      <div
        ref={setNodeRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-0.5"
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {adding ? (
            <div className="mb-2">
              <InlineTaskCreator
                workspaceId={project.workspaceId}
                projectId={project.id}
                sectionId={section.id}
                onCreated={() => setAdding(false)}
              />
            </div>
          ) : null}
          {tasks.length === 0 && !adding ? (
            <p className="py-6 text-center text-xs" style={{ color: 'hsl(var(--foreground-subtle))' }}>
              Drag cards here
            </p>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                cardFields={cardFields}
                allFields={allFields}
                tags={tags}
                users={users}
                allTasks={allTasks}
                density={density}
                onOpen={() => onOpenTask(task.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}

'use client'

/**
 * TaskRow — single spreadsheet row with checkbox, cells, and hover actions.
 */
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Checkbox } from '@/components/ui/checkbox'
import type { CustomField, Project, Section, Tag, Task, User } from '../../../types'
import type { ColumnDef } from '../../../stores/columns'
import { LIST_NAME_STICKY_LEFT, LIST_ROW_HEIGHT } from './listTypes'
import { TaskNameCell } from './TaskNameCell'
import { TaskCompleteCell } from './TaskCompleteCell'
import { TaskRowCell } from './TaskRowCells'
import { TaskRowActions } from './TaskRowActions'

type Props = {
  task: Task
  depth: number
  columns: ColumnDef[]
  gridTemplate: string
  allTasks: Task[]
  users: User[]
  tags: Tag[]
  projects: Project[]
  projectFields: CustomField[]
  customFieldMap: Record<string, CustomField>
  workspaceId: string
  projectId: string
  sections: Section[]
  selected: boolean
  expanded: boolean
  onToggleExpand: () => void
  onToggleSelect: (shiftKey: boolean) => void
  onOpenDetail: () => void
  orderedIds: string[]
}

/** One task row in the list grid. */
export function TaskRow({
  task,
  depth,
  columns,
  gridTemplate,
  allTasks,
  users,
  tags,
  projects,
  projectFields,
  customFieldMap,
  workspaceId,
  projectId,
  sections,
  selected,
  expanded,
  onToggleExpand,
  onToggleSelect,
  onOpenDetail,
}: Props) {
  const visible = columns.filter((c) => c.visible)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: {
      type: 'task',
      taskId: task.id,
      sectionId: task.sectionIdByProject[projectId],
    },
  })

  return (
    <div
      ref={setNodeRef}
      className="group relative grid items-center border-b"
      style={{
        gridTemplateColumns: gridTemplate,
        height: LIST_ROW_HEIGHT,
        borderColor: 'hsl(var(--border))',
        background: selected ? 'hsl(var(--surface-muted))' : task.completed ? 'hsl(var(--surface-muted))' : 'hsl(var(--card))',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
      }}
      data-task-id={task.id}
    >
      <div className="relative z-[15] flex items-center justify-center px-1">
        <Checkbox
          className="tl-checkbox"
          checked={selected}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(e.shiftKey)
          }}
          aria-label={`Select ${task.name}`}
        />
      </div>
      <div className="relative z-[15] flex items-center justify-center px-1">
        <TaskCompleteCell task={task} />
      </div>
      {visible.map((col) => (
        <div
          key={col.id}
          className={`min-w-0 overflow-visible px-2 ${col.id === 'name' ? 'sticky z-10 bg-inherit' : 'relative z-[1]'}`}
          style={col.id === 'name' ? { left: LIST_NAME_STICKY_LEFT } : undefined}
        >
          {col.id === 'name' ? (
            <TaskNameCell
              task={task}
              allTasks={allTasks}
              depth={depth}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onOpenDetail={onOpenDetail}
            />
          ) : (
            <TaskRowCell
              column={col}
              task={task}
              users={users}
              tags={tags}
              projects={projects}
              projectFields={projectFields}
              customFieldMap={customFieldMap}
              workspaceId={workspaceId}
            />
          )}
        </div>
      ))}
      <TaskRowActions
        task={task}
        projectId={projectId}
        sections={sections}
        onOpen={onOpenDetail}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  )
}

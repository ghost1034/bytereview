'use client'

/**
 * ListRowRenderer — maps flat ListRow descriptors to view components.
 */
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CustomField, Project, Section, Tag, Task, User } from '../../../types'
import type { ColumnDef } from '../../../stores/columns'
import type { ListRow } from './listTypes'
import { SectionHeaderRow } from './SectionHeaderRow'
import { TaskRow } from './TaskRow'
import { InlineNewTaskRow } from './InlineNewTaskRow'
import { findOrCreateEmptySection } from '../../../lib/projectActions'

export type ListRowRendererProps = {
  row: ListRow
  project: Project
  sections: Section[]
  columns: ColumnDef[]
  gridTemplate: string
  allTasks: Task[]
  users: User[]
  tags: Tag[]
  allProjects: Project[]
  projectFields: CustomField[]
  customFieldMap: Record<string, CustomField>
  selected: Set<string>
  expandedTaskIds: Set<string>
  activeAddGroups: Set<string>
  flatTaskIds: string[]
  onToggleCollapse: (groupKey: string) => void
  onToggleGroupSelect: (taskIds: string[]) => void
  onAddTaskGroup: (groupKey: string) => void
  onCancelAddGroup: (groupKey: string) => void
  onSectionAdded: (sectionId: string) => void
  onSectionNamed: () => void
  focusSectionId: string | null
  onToggleExpand: (taskId: string) => void
  onToggleSelect: (taskId: string, shift: boolean) => void
  onOpenTask: (taskId: string) => void
}

/** Render one list body row from a descriptor. */
export function ListRowRenderer(props: ListRowRendererProps) {
  const { row, project } = props

  if (row.kind === 'empty') {
    return (
      <div className="px-4 py-12 text-center font-sans text-lg" style={{ color: 'hsl(var(--foreground-muted))' }}>
        This project is a blank canvas — add a section, then start adding tasks.
      </div>
    )
  }

  if (row.kind === 'group-header') {
    return (
      <SectionHeaderRow
        label={row.label}
        groupKey={row.groupKey}
        section={row.section}
        taskCount={row.taskIds.length}
        taskIds={row.taskIds}
        collapsed={row.collapsed}
        isSectionGroup={row.isSectionGroup}
        projectId={project.id}
        sectionIds={props.sections.map((s) => s.id)}
        selected={props.selected}
        onToggleCollapse={() => props.onToggleCollapse(row.groupKey)}
        onToggleSelect={() => props.onToggleGroupSelect(row.taskIds)}
        onAddTask={() => props.onAddTaskGroup(row.groupKey)}
        autoFocusName={props.focusSectionId === row.section?.id}
        onSectionNamed={props.onSectionNamed}
      />
    )
  }

  if (row.kind === 'add-task') {
    return (
      <InlineNewTaskRow
        gridTemplate={props.gridTemplate}
        workspaceId={project.workspaceId}
        projectId={project.id}
        sectionId={row.sectionId}
        allTasks={props.allTasks}
        faint={!props.activeAddGroups.has(row.groupKey)}
        forceActive={props.activeAddGroups.has(row.groupKey)}
        onCancel={() => props.onCancelAddGroup(row.groupKey)}
        placeholder="Add task…"
      />
    )
  }

  if (row.kind === 'add-subtask') {
    return (
      <InlineNewTaskRow
        gridTemplate={props.gridTemplate}
        workspaceId={project.workspaceId}
        projectId={project.id}
        sectionId={row.sectionId}
        parentId={row.parentId}
        allTasks={props.allTasks}
        faint={false}
      />
    )
  }

  if (row.kind === 'add-section') {
    return (
      <div className="px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          style={{ color: 'hsl(var(--primary))' }}
          onClick={() => {
            void findOrCreateEmptySection(project.id).then((section) => {
              props.onSectionAdded(section.id)
            })
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add section
        </Button>
      </div>
    )
  }

  if (row.kind === 'task') {
    return (
      <TaskRow
        task={row.task}
        depth={row.depth}
        columns={props.columns}
        gridTemplate={props.gridTemplate}
        allTasks={props.allTasks}
        users={props.users}
        tags={props.tags}
        projects={props.allProjects}
        projectFields={props.projectFields}
        customFieldMap={props.customFieldMap}
        workspaceId={project.workspaceId}
        projectId={project.id}
        sections={props.sections}
        selected={props.selected.has(row.task.id)}
        expanded={props.expandedTaskIds.has(row.task.id)}
        onToggleExpand={() => props.onToggleExpand(row.task.id)}
        onToggleSelect={(shift) => props.onToggleSelect(row.task.id, shift)}
        onOpenDetail={() => props.onOpenTask(row.task.id)}
        orderedIds={props.flatTaskIds}
      />
    )
  }

  return null
}

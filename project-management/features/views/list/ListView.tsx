'use client'

/**
 * ListView — spreadsheet-style task list grouped by section with inline editing and DnD.
 */
import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Project } from '../../../types'
import { useAuthStore } from '../../../stores/auth'
import { toggleCollapsed } from '../board/boardUtils'
import { ListToolbar } from './ListToolbar'
import { ColumnHeader } from './ColumnHeader'
import { BulkActionsBar } from './BulkActionsBar'
import { ListVirtualScroll } from './ListVirtualScroll'
import { ListRowRenderer } from './ListRowRenderer'
import { useListSelection } from './useListSelection'
import { useListDragDrop } from './useListDragDrop'
import { useListViewData } from './useListViewData'
import { useOpenProjectTask } from '../../tasks/useTaskDetailUrl'

type Props = { project: Project; basePath: string }

/** Default Asana-style list view for a project. */
export function ListView({ project, basePath }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const openTask = useOpenProjectTask(basePath, 'list')
  const data = useListViewData(project, currentUserId)
  const { selected, toggle, toggleGroup, clear, count } = useListSelection()
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null)

  const onDragEnd = useListDragDrop({
    project,
    sections: data.sections,
    allTasks: data.allTasks,
    groupBySection: data.groupBySection,
    currentUserId,
    tasksByGroup: data.tasksByGroup,
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && count > 0) clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clear, count])

  const rowProps = {
    project,
    sections: data.sections,
    columns: data.columns,
    gridTemplate: data.gridTemplate,
    allTasks: data.allTasks,
    users: data.users,
    tags: data.tags,
    allProjects: data.allProjects,
    projectFields: data.projectFields,
    customFieldMap: data.customFieldMap,
    selected,
    expandedTaskIds: data.expandedTaskIds,
    activeAddGroups: data.activeAddGroups,
    flatTaskIds: data.flatTaskIds,
    onToggleCollapse: (groupKey: string) =>
      data.patchQuery({ collapsedSectionIds: toggleCollapsed(data.query.collapsedSectionIds, groupKey) }),
    onToggleGroupSelect: toggleGroup,
    onAddTaskGroup: data.activateAddGroup,
    onCancelAddGroup: data.deactivateAddGroup,
    onSectionAdded: (sectionId: string) => setFocusSectionId(sectionId),
    onSectionNamed: () => setFocusSectionId(null),
    focusSectionId,
    onToggleExpand: data.toggleExpand,
    onToggleSelect: (taskId: string, shift: boolean) => toggle(taskId, data.flatTaskIds, shift),
    onOpenTask: openTask,
  }

  return (
    <div className="relative pb-20">
      <ListToolbar
        query={data.query}
        onChange={data.setQuery}
        projectId={project.id}
        customFields={data.projectFields}
        members={data.members}
        sections={data.sections}
        tags={data.tags}
        userId={currentUserId}
        columns={data.columns}
      />
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
        <div ref={scrollRef} className="max-h-[calc(100vh-16rem)] overflow-auto">
          <div style={{ minWidth: data.gridMinWidth }}>
            <ColumnHeader
            userId={currentUserId}
            projectId={project.id}
            columns={data.columns}
            gridTemplate={data.gridTemplate}
            allTaskIds={data.flatTaskIds}
            selected={selected}
            onToggleAll={() => toggleGroup(data.flatTaskIds)}
          />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => void onDragEnd(e)}>
            <SortableContext items={data.sortableIds} strategy={verticalListSortingStrategy}>
              <ListVirtualScroll
                rowCount={data.rows.length}
                scrollRef={scrollRef}
                renderRow={(index) => {
                  const row = data.rows[index]
                  if (!row) return null
                  return <ListRowRenderer key={`${row.kind}-${index}`} row={row} {...rowProps} />
                }}
              />
            </SortableContext>
          </DndContext>
          </div>
        </div>
      </div>
      <BulkActionsBar selected={selected} workspaceId={project.workspaceId} currentProjectId={project.id} onClear={clear} />
    </div>
  )
}

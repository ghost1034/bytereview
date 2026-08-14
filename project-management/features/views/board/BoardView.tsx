'use client'

/**
 * BoardView — Kanban board with WIP limits, swimlanes, density, and collapsed columns.
 */
import { useMemo, useState } from 'react'
import { DndContext } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Project, Task } from '../../../types'
import { useAuthStore } from '../../../stores/auth'
import {
  useCustomFieldsStore,
  useSectionsStore,
  useTagsStore,
  useTasksStore,
  useUsersStore,
} from '../../../stores/entities'
import { useProjectFields } from '../../custom-fields/useProjectFields'
import { QueryToolbar, useViewQuery } from '../../query'
import { applyViewQuery } from '../../../lib/query/applyQuery'
import { resolvesSwimlanes } from '../../../lib/query/viewQueryHelpers'
import { addProjectSection } from '../../../lib/projectActions'
import { BoardDragPreview } from './BoardDragPreview'
import { BoardColumn } from './BoardColumn'
import { TaskUndoButton } from '../../ui/TaskUndoButton'
import { BoardToolbar } from './BoardToolbar'
import { buildTasksBySection, groupByAssignee, toggleCollapsed, BOARD_VIEWPORT_HEIGHT, BOARD_VIEWPORT_MIN_HEIGHT } from './boardUtils'
import { useBoardDnd } from './useBoardDnd'
import { useOpenProjectTask } from '../../tasks/useTaskDetailUrl'

type Props = { project: Project; basePath: string }

export function BoardView({ project, basePath }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const openTask = useOpenProjectTask(basePath, 'board')
  const { query, setQuery } = useViewQuery(project.id, 'board')
  const sections = useSectionsStore((s) =>
    s.list().filter((sec) => sec.projectId === project.id).sort((a, b) => a.order - b.order)
  )
  const allTasks = useTasksStore((s) => s.list())
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list().filter((t) => t.workspaceId === project.workspaceId))
  const customFields = useCustomFieldsStore((s) => s.list())
  const { cardFields, fields: allFields } = useProjectFields(project)
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null)

  const tasks = useMemo(
    () =>
      applyViewQuery(
        allTasks.filter((t) => t.projectIds.includes(project.id) && !t.parentId),
        query,
        project.id,
        currentUserId
      ),
    [allTasks, currentUserId, project.id, query]
  )

  const tasksBySection = useMemo(
    () => buildTasksBySection(tasks, sections, project.id, project.taskOrderBySection),
    [tasks, sections, project.id, project.taskOrderBySection]
  )

  const swimlanes = resolvesSwimlanes(query)
  const swimlaneRows = useMemo(
    () => (swimlanes ? groupByAssignee(tasks, users) : null),
    [swimlanes, tasks, users]
  )

  const density: 'compact' | 'comfortable' = query.density === 'compact' ? 'compact' : 'comfortable'
  const collapsedIds = new Set(query.collapsedSectionIds ?? [])

  const { sensors, onDragStart, onDragEnd, activeTask, DragOverlay } = useBoardDnd({
    project,
    sections,
    tasks,
    tasksBySection,
    currentUserId,
  })

  const columnProps = {
    project,
    basePath,
    cardFields,
    allFields,
    tags,
    users,
    allTasks,
    density,
    onOpenTask: openTask,
  }

  const renderColumns = (sectionTasks: Map<string, Task[]>) =>
    sections.map((section) => (
      <BoardColumn
        key={section.id}
        section={section}
        tasks={sectionTasks.get(section.id) ?? []}
        collapsed={collapsedIds.has(section.id)}
        autoFocusName={focusSectionId === section.id}
        onToggleCollapse={() =>
          setQuery({
            ...query,
            collapsedSectionIds: toggleCollapsed(query.collapsedSectionIds, section.id),
          })
        }
        {...columnProps}
      />
    ))

  const addSection = async () => {
    const section = await addProjectSection(project.id, 'New section')
    setFocusSectionId(section.id)
  }

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="font-sans text-lg">Add a section to start.</p>
        <Button className="mt-4 gap-1.5" onClick={() => void addSection()}>
          <Plus className="h-4 w-4" />
          Add section
        </Button>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={(e) => void onDragEnd(e)}>
      <QueryToolbar
        query={query}
        onChange={setQuery}
        projectId={project.id}
        viewType="board"
        customFields={customFields}
        members={users}
        sections={sections}
        tags={tags}
      />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <BoardToolbar query={query} onChange={setQuery} />
        <TaskUndoButton />
      </div>

      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ height: BOARD_VIEWPORT_HEIGHT, minHeight: BOARD_VIEWPORT_MIN_HEIGHT }}
      >
        {swimlanes && swimlaneRows ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {swimlaneRows.map((lane) => {
              const laneMap = buildTasksBySection(
                lane.tasks,
                sections,
                project.id,
                project.taskOrderBySection
              )
              return (
                <div key={lane.key} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div
                    className="mb-1 flex shrink-0 items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'hsl(var(--foreground-muted))' }}
                  >
                    {lane.label}
                    <span className="font-normal normal-case">({lane.tasks.length})</span>
                  </div>
                  <div className="flex min-h-0 flex-1 items-stretch snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-1">
                    {renderColumns(laneMap)}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-stretch snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-1">
            {renderColumns(tasksBySection)}
          </div>
        )}

        <Button variant="outline" size="sm" className="mt-2 shrink-0 gap-1.5 self-start" onClick={() => void addSection()}>
          <Plus className="h-4 w-4" />
          Add section
        </Button>
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="rotate-2 opacity-95">
            <BoardDragPreview task={activeTask} tags={tags} density={density} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

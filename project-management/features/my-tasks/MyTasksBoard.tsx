'use client'

/**
 * MyTasksBoard — Kanban view with personal section columns.
 */
import { useRouter } from 'next/navigation'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { QueryToolbar } from '../query'
import { useAuthStore } from '../../stores/auth'
import { useCustomFieldsStore, useTagsStore, useUsersStore } from '../../stores/entities'
import { toggleCollapsed } from '../views/board/boardUtils'
import { MyTasksBoardColumn } from './MyTasksBoardColumn'
import { MyTasksQuickFilters } from './MyTasksQuickFilters'
import { MyTasksTaskRow } from './MyTasksTaskRow'
import { useMyTasksBoardDnd } from './useMyTasksBoardDnd'
import { useMyTasksSelector } from './useMyTasksSelector'

type Props = { workspaceId: string; basePath: string }

/** Board view — columns mirror personal sections. */
export function MyTasksBoard({ workspaceId, basePath }: Props) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const customFields = useCustomFieldsStore((s) => s.list().filter((f) => f.workspaceId === workspaceId))
  const { sections, projects, projectById, query, setQuery, patchQuery } = useMyTasksSelector({
    workspaceId,
    userId: currentUserId,
    viewMode: 'board',
  })
  const sectionIds = sections.map((s) => s.id)
  const { sensors, activeTask, onDragStartEvent, onDragEnd } = useMyTasksBoardDnd({ currentUserId, sectionIds })
  const openTask = (taskId: string) => router.push(`${basePath}?task=${taskId}`)

  return (
    <div>
      <QueryToolbar
        query={query}
        onChange={setQuery}
        showSavedViews={false}
        showGroupBy={false}
        showCustomize={false}
        customFields={customFields}
        members={users}
        tags={tags}
      />
      <MyTasksQuickFilters query={query} onChange={setQuery} projects={projects} />

      <DndContext sensors={sensors} onDragStart={onDragStartEvent} onDragEnd={onDragEnd}>
        <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
          {sections.map((section) => (
            <MyTasksBoardColumn
              key={section.id}
              sectionId={section.id}
              label={section.label}
              tasks={section.tasks}
              collapsed={(query.collapsedSectionIds ?? []).includes(String(section.id))}
              projectById={projectById}
              onToggleCollapse={() =>
                patchQuery({
                  collapsedSectionIds: toggleCollapsed(query.collapsedSectionIds, String(section.id)),
                })
              }
              onOpenTask={openTask}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <MyTasksTaskRow
              task={activeTask}
              projectById={projectById}
              onOpen={() => undefined}
              draggable={false}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

'use client'

/**
 * MyTasksList — section-grouped list view for personal tasks.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { QueryToolbar } from '../query'
import { useAuthStore } from '../../stores/auth'
import { useCustomFieldsStore, useTagsStore, useUsersStore } from '../../stores/entities'
import { toggleCollapsed } from '../views/board/boardUtils'
import { assignTaskToMySection } from './myTasksActions'
import { MyTasksInlineAdd } from './MyTasksInlineAdd'
import { MyTasksQuickFilters } from './MyTasksQuickFilters'
import { MyTasksSectionHeader } from './MyTasksSectionHeader'
import { MyTasksTaskRow } from './MyTasksTaskRow'
import { useMyTasksSelector } from './useMyTasksSelector'
import type { MyTasksSectionId } from './types'

type Props = {
  workspaceId: string
  basePath: string
  defaultProjectId?: string
}

function SectionDrop({ sectionId, children }: { sectionId: MyTasksSectionId; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${sectionId}` })
  return (
    <div
      ref={setNodeRef}
      className="rounded-lg"
      style={{ outline: isOver ? '2px solid hsl(var(--primary))' : undefined, outlineOffset: 2 }}
    >
      {children}
    </div>
  )
}

/** List view with personal sections and inline actions. */
export function MyTasksList({ workspaceId, basePath, defaultProjectId }: Props) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const customFields = useCustomFieldsStore((s) => s.list().filter((f) => f.workspaceId === workspaceId))
  const { sections, projects, projectById, query, setQuery, patchQuery } = useMyTasksSelector({
    workspaceId,
    userId: currentUserId,
    viewMode: 'list',
  })
  const [addingSection, setAddingSection] = useState<MyTasksSectionId | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const openTask = (taskId: string) => router.push(`${basePath}?task=${taskId}`)

  const onDragEnd = (event: DragEndEvent) => {
    const taskId = String(event.active.id)
    const overId = event.over?.id
    if (!overId || !currentUserId) return
    const sectionId = String(overId).replace(/^section:/, '')
    void assignTaskToMySection(taskId, currentUserId, sectionId as MyTasksSectionId, currentUserId)
  }

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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="mt-4 space-y-4">
          {sections.map((section) => {
            const collapsed = (query.collapsedSectionIds ?? []).includes(String(section.id))
            return (
              <section key={section.id} className="tl-card p-4 shadow-sm">
                <div id={`section:${section.id}`}>
                  <MyTasksSectionHeader
                    sectionId={section.id}
                    label={section.label}
                    count={section.tasks.length}
                    collapsed={collapsed}
                    onToggleCollapse={() =>
                      patchQuery({
                        collapsedSectionIds: toggleCollapsed(query.collapsedSectionIds, String(section.id)),
                      })
                    }
                    onAddTask={() => setAddingSection(section.id)}
                  />
                </div>
                {!collapsed ? (
                  <SectionDrop sectionId={section.id}>
                    <SortableContext items={section.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-2">
                        {section.tasks.map((task) => (
                          <li key={task.id}>
                            <MyTasksTaskRow task={task} projectById={projectById} onOpen={() => openTask(task.id)} />
                          </li>
                        ))}
                        {addingSection === section.id ? (
                          <li>
                            <MyTasksInlineAdd
                              workspaceId={workspaceId}
                              sectionId={section.id}
                              defaultProjectId={defaultProjectId}
                              onDone={() => setAddingSection(null)}
                            />
                          </li>
                        ) : null}
                      </ul>
                    </SortableContext>
                  </SectionDrop>
                ) : null}
              </section>
            )
          })}
        </div>
        <DragOverlay />
      </DndContext>
    </div>
  )
}

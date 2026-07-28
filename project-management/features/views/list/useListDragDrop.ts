'use client'

/**
 * useListDragDrop — row/section drag handlers for List view ordering and nesting.
 */
import { useCallback } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import type { Project, Section, Task } from '../../../types'
import { reparentTask, setSectionForProject } from '../../../lib/taskActions'
import { reorderProjectSections } from '../../../lib/projectActions'
import { useProjectsStore } from '../../../stores/entities'
import { now } from '../../../lib/time'
import { canReparent } from '../../tasks'
import { reorderIds } from './listUtils'

type Args = {
  project: Project
  sections: Section[]
  allTasks: Task[]
  groupBySection: boolean
  currentUserId: string | null
  tasksByGroup: Map<string, Task[]>
}

/** Returns DnD end handler persisting section order, task order, and reparent. */
export function useListDragDrop({
  project,
  sections,
  allTasks,
  groupBySection,
  currentUserId,
  tasksByGroup,
}: Args) {
  const updateProject = useProjectsStore((s) => s.update)

  return useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || !currentUserId) return

      const activeData = active.data.current as { type?: string; sectionId?: string; taskId?: string } | undefined
      const overData = over.data.current as { type?: string; sectionId?: string; taskId?: string } | undefined
      const activeId = String(active.id)
      const overId = String(over.id)

      if (activeId.startsWith('section:') && groupBySection) {
        const sectionId = activeId.replace('section:', '')
        const overSectionId = overId.replace('section:', '')
        if (sectionId === overSectionId) return
        const ids = sections.map((s) => s.id)
        const from = ids.indexOf(sectionId)
        const to = ids.indexOf(overSectionId)
        if (from === -1 || to === -1) return
        ids.splice(from, 1)
        ids.splice(to, 0, sectionId)
        await reorderProjectSections(project.id, ids)
        return
      }

      const taskId = activeData?.taskId ?? activeId
      const task = allTasks.find((t) => t.id === taskId)
      if (!task) return

      const overTaskId = overData?.taskId ?? (overId.startsWith('task:') ? overId.replace('task:', '') : overId)
      const overTask = allTasks.find((t) => t.id === overTaskId)

      const nestDrop =
        overTask &&
        overTask.id !== task.id &&
        event.activatorEvent instanceof MouseEvent &&
        (event.activatorEvent.altKey || event.activatorEvent.shiftKey)

      if (nestDrop) {
        const check = canReparent(task.id, overTask.id, allTasks)
        if (check.ok) {
          await reparentTask(task.id, overTask.id, currentUserId)
          return
        }
      }

      let targetSectionId = overData?.sectionId
      if (!targetSectionId && overId.startsWith('section:')) {
        targetSectionId = overId.replace('section:', '')
      }
      if (!targetSectionId && overTask) {
        targetSectionId = overTask.sectionIdByProject[project.id]
      }
      const validSection = (id: string | undefined): id is string =>
        Boolean(id && id !== '__none__' && sections.some((s) => s.id === id))
      if (!validSection(targetSectionId)) return

      const currentSectionId = task.sectionIdByProject[project.id]
      if (currentSectionId !== targetSectionId) {
        await setSectionForProject(task.id, project.id, targetSectionId, currentUserId)
      }

      const groupTasks = tasksByGroup.get(targetSectionId) ?? []
      const order = project.taskOrderBySection?.[targetSectionId] ?? groupTasks.map((t) => t.id)
      const overTaskForOrder = overTask && overTask.sectionIdByProject[project.id] === targetSectionId ? overTask.id : null
      const nextOrder = reorderIds(
        order.includes(taskId) ? order : [...order, taskId],
        taskId,
        overTaskForOrder
      )
      await updateProject(project.id, {
        taskOrderBySection: { ...project.taskOrderBySection, [targetSectionId]: nextOrder },
        modifiedAt: now(),
      })
    },
    [allTasks, currentUserId, groupBySection, project, sections, tasksByGroup, updateProject]
  )
}

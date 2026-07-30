'use client'

/**
 * Board drag-and-drop — cross-column moves, reorder, and WIP enforcement.
 */
import { useCallback, useState } from 'react'
import {
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { Project, Section, Task } from '../../../types'
import { useProjectsStore } from '../../../stores/entities'
import { updateTask } from '../../../lib/taskActions'
import { now } from '../../../lib/time'
import { wouldBlockWipDrop } from './boardUtils'

type Args = {
  project: Project
  sections: Section[]
  tasks: Task[]
  tasksBySection: Map<string, Task[]>
  currentUserId: string | null
}

function resolveSectionId(
  overId: string,
  sections: Section[],
  tasks: Task[],
  projectId: string
): string | undefined {
  if (sections.some((s) => s.id === overId)) return overId
  return tasks.find((t) => t.id === overId)?.sectionIdByProject[projectId]
}

/** Hook returning DnD sensors, handlers, and overlay for the board. */
export function useBoardDnd({ project, sections, tasks, tasksBySection, currentUserId }: Args) {
  const updateProject = useProjectsStore((s) => s.update)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks.find((t) => t.id === String(event.active.id))
      setActiveTask(task ?? null)
    },
    [tasks]
  )

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null)
      const { active, over } = event
      if (!over || !currentUserId) return

      const taskId = String(active.id)
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return

      const targetSectionId = resolveSectionId(String(over.id), sections, tasks, project.id)
      if (!targetSectionId) return

      const sourceSectionId = task.sectionIdByProject[project.id] ?? sections[0]?.id
      if (!sourceSectionId) return

      const movingAcross = targetSectionId !== sourceSectionId
      const targetList = tasksBySection.get(targetSectionId) ?? []
      const targetSection = sections.find((s) => s.id === targetSectionId)

      if (movingAcross && wouldBlockWipDrop(targetList.length, targetSection?.wipLimit)) return

      if (movingAcross) {
        await updateTask(
          taskId,
          { sectionIdByProject: { ...task.sectionIdByProject, [project.id]: targetSectionId } },
          currentUserId
        )
      }

      const currentOrder = (project.taskOrderBySection?.[targetSectionId] ?? targetList.map((t) => t.id)).filter(
        (id) => id !== taskId
      )
      const overIsTask = tasks.some((t) => t.id === over.id)
      let nextTarget = currentOrder

      if (overIsTask && String(over.id) !== taskId) {
        const insertAt = currentOrder.indexOf(String(over.id))
        nextTarget = [...currentOrder]
        nextTarget.splice(insertAt >= 0 ? insertAt : nextTarget.length, 0, taskId)
      } else {
        nextTarget = [...currentOrder, taskId]
      }

      if (!movingAcross && overIsTask) {
        const oldIndex = nextTarget.indexOf(taskId)
        const newIndex = nextTarget.indexOf(String(over.id))
        if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
          nextTarget = arrayMove(nextTarget, oldIndex, newIndex)
        }
      }

      const taskOrderBySection = {
        ...project.taskOrderBySection,
        [targetSectionId]: nextTarget,
      }

      if (movingAcross) {
        const sourceList = tasksBySection.get(sourceSectionId) ?? []
        const sourceOrder = (project.taskOrderBySection?.[sourceSectionId] ?? sourceList.map((t) => t.id)).filter(
          (id) => id !== taskId
        )
        taskOrderBySection[sourceSectionId] = sourceOrder
      }

      await updateProject(project.id, { taskOrderBySection, modifiedAt: now() })
    },
    [currentUserId, project, sections, tasks, tasksBySection, updateProject]
  )

  return { sensors, onDragStart, onDragEnd, activeTask, DragOverlay }
}

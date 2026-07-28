'use client'

/**
 * useMyTasksBoardDnd — drag tasks between personal section columns.
 */
import { useCallback, useState } from 'react'
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import type { Task } from '../../types'
import { useTasksStore } from '../../stores/entities'
import { assignTaskToMySection } from './myTasksActions'
import type { MyTasksSectionId } from './types'

type Args = {
  currentUserId: string | null
  sectionIds: MyTasksSectionId[]
}

/** Board drag-and-drop handlers for My Tasks columns. */
export function useMyTasksBoardDnd({ currentUserId, sectionIds }: Args) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const onDragStartEvent = useCallback((event: DragStartEvent) => {
    const task = useTasksStore.getState().getById(String(event.active.id))
    if (task) setActiveTask(task)
  }, [])

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null)
      if (!currentUserId) return
      const taskId = String(event.active.id)
      const overId = event.over?.id
      if (!overId) return
      const raw = String(overId)
      const sectionId = (raw.startsWith('col:') ? raw.slice(4) : raw) as MyTasksSectionId
      if (!sectionIds.includes(sectionId)) return
      void assignTaskToMySection(taskId, currentUserId, sectionId, currentUserId)
    },
    [currentUserId, sectionIds]
  )

  return { sensors, activeTask, onDragStartEvent, onDragEnd }
}

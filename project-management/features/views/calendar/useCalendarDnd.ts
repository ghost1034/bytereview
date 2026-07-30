'use client'

/**
 * useCalendarDnd — drag reschedule helpers for calendar chips and drawer items.
 */
import { useCallback, useState } from 'react'
import type { Task } from '../../../types'
import { updateTask } from '../../../lib/taskActions'
import { buildDatePatch, buildRangePatch } from './calendarUtils'

type Args = {
  currentUserId: string | null
}

export function useCalendarDnd({ currentUserId }: Args) {
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null)

  const onDragStart = useCallback((taskId: string, e: React.DragEvent) => {
    e.dataTransfer.setData('text/task-id', taskId)
    e.dataTransfer.effectAllowed = 'move'
    setDragTaskId(taskId)
  }, [])

  const onDragEnd = useCallback(() => {
    setDragTaskId(null)
    setRangeAnchor(null)
  }, [])

  const scheduleOnDay = useCallback(
    async (task: Task, dayKey: string, extendRange?: boolean) => {
      if (!currentUserId) return
      let patch: Partial<Task>
      if (extendRange && rangeAnchor && rangeAnchor !== dayKey) {
        patch = buildRangePatch(rangeAnchor, dayKey)
      } else {
        patch = buildDatePatch(task, dayKey)
      }
      await updateTask(task.id, patch, currentUserId)
      setRangeAnchor(null)
      setDragTaskId(null)
    },
    [currentUserId, rangeAnchor]
  )

  const dropOnDay = useCallback(
    async (e: React.DragEvent, dayKey: string, tasks: Task[]) => {
      e.preventDefault()
      const taskId = e.dataTransfer.getData('text/task-id') || dragTaskId
      if (!taskId || !currentUserId) return
      const task = tasks.find((t) => t.id === taskId)
      if (!task) {
        await updateTask(taskId, { dueOn: dayKey }, currentUserId)
        return
      }
      const extendRange = e.shiftKey
      if (extendRange && !rangeAnchor) setRangeAnchor(task.dueOn?.slice(0, 10) ?? dayKey)
      await scheduleOnDay(task, dayKey, extendRange)
    },
    [currentUserId, dragTaskId, rangeAnchor, scheduleOnDay]
  )

  return { dragTaskId, onDragStart, onDragEnd, dropOnDay, scheduleOnDay }
}

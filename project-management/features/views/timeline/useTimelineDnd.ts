'use client'

/**
 * Drag-to-move/resize task bars and create dependencies from end handles.
 */
import { useCallback, useRef, useState } from 'react'
import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import { dragEndDeltaDays, enforceDependentScheduling, shiftDependentsChain } from '../../../lib/dependencyScheduling'
import { setDue, updateTask } from '../../../lib/taskActions'
import { addDependency } from '../../../lib/dependencies'
import { toISODate } from '../../../lib/time'
import type { Task } from '../../../types'
import { PX_PER_UNIT } from './constants'
import { getTaskSpan, snapDate } from './timelineUtils'
import type { ZoomLevel } from './types'

export type DragMode = 'move' | 'resize-start' | 'resize-end' | 'link' | null

type DragState = {
  mode: DragMode
  taskId: string
  startX: number
  origStart: Date
  origEnd: Date
}

type Options = {
  zoom: ZoomLevel
  autoShift: boolean
  actorId: string | null
  tasks: Task[]
  onLinkError?: (msg: string) => void
}

function unitDays(zoom: ZoomLevel): number {
  if (zoom === 'day') return 1
  if (zoom === 'week') return 7
  if (zoom === 'month') return 30
  if (zoom === 'quarter') return 91
  return 365
}

/** Pointer handlers for timeline bar DnD. */
export function useTimelineDnd({
  zoom,
  autoShift,
  actorId,
  tasks,
  onLinkError,
}: Options) {
  const dragRef = useRef<DragState | null>(null)
  const [linkFromId, setLinkFromId] = useState<string | null>(null)
  const [linkHoverId, setLinkHoverId] = useState<string | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent, taskId: string, mode: DragMode) => {
      e.stopPropagation()
      const task = tasks.find((t) => t.id === taskId)
      const span = task ? getTaskSpan(task) : null
      if (!span || !mode) return
      if (mode === 'link') {
        setLinkFromId(taskId)
        return
      }
      dragRef.current = { mode, taskId, startX: e.clientX, origStart: span.start, origEnd: span.end }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [tasks]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag || !actorId) return
      const pxPerDay = PX_PER_UNIT[zoom] / unitDays(zoom)
      const deltaDays = Math.round((e.clientX - drag.startX) / pxPerDay)

      if (drag.mode === 'move') {
        const ns = snapDate(addDays(drag.origStart, deltaDays), zoom)
        const ne = snapDate(addDays(drag.origEnd, deltaDays), zoom)
        void updateTask(drag.taskId, { startOn: toISODate(ns), dueOn: toISODate(ne) }, actorId)
      } else if (drag.mode === 'resize-start') {
        const ns = snapDate(addDays(drag.origStart, deltaDays), zoom)
        if (ns <= drag.origEnd) void updateTask(drag.taskId, { startOn: toISODate(ns) }, actorId)
      } else if (drag.mode === 'resize-end') {
        const ne = snapDate(addDays(drag.origEnd, deltaDays), zoom)
        if (ne >= drag.origStart) void updateTask(drag.taskId, { dueOn: toISODate(ne) }, actorId)
      }
    },
    [actorId, zoom]
  )

  const onPointerUp = useCallback(
    async (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (drag && actorId) {
        if (
          autoShift &&
          (drag.mode === 'move' || drag.mode === 'resize-end')
        ) {
          const delta = dragEndDeltaDays(
            drag.startX,
            e.clientX,
            drag.origEnd,
            drag.mode,
            zoom
          )
          if (delta > 0) await shiftDependentsChain(drag.taskId, delta, actorId)
        }
        dragRef.current = null
        ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
      }

      if (linkFromId && linkHoverId && linkFromId !== linkHoverId && actorId) {
        const result = await addDependency(linkHoverId, linkFromId, actorId)
        if (!result.ok) onLinkError?.(result.error ?? 'Could not add dependency')
        else if (autoShift) await enforceDependentScheduling(tasks, actorId)
      }
      setLinkFromId(null)
      setLinkHoverId(null)
    },
    [actorId, autoShift, linkFromId, linkHoverId, onLinkError, zoom]
  )

  const quickAddDate = useCallback(
    async (taskId: string) => {
      if (!actorId) return
      await setDue(taskId, { dueOn: toISODate(startOfDay(new Date())) }, actorId)
    },
    [actorId]
  )

  return {
    linkFromId,
    linkHoverId,
    setLinkHoverId,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    quickAddDate,
  }
}

/** Resolve bar geometry for rendering. */
export function barGeometry(task: Task, rangeStart: Date, zoom: ZoomLevel): { left: number; width: number } | null {
  const span = getTaskSpan(task)
  if (!span) return null
  const ud = unitDays(zoom)
  const px = PX_PER_UNIT[zoom]
  const left = (differenceInCalendarDays(span.start, rangeStart) / ud) * px
  const days = differenceInCalendarDays(span.end, span.start) + 1
  return { left: left + 2, width: Math.max((days / ud) * px - 4, px * 0.35) }
}

/** Milestone center X. */
export function milestoneX(task: Task, rangeStart: Date, zoom: ZoomLevel): number | null {
  const date = task.dueOn ? parseISO(task.dueOn) : task.startOn ? parseISO(task.startOn) : null
  if (!date) return null
  const ud = unitDays(zoom)
  return (differenceInCalendarDays(startOfDay(date), rangeStart) / ud) * PX_PER_UNIT[zoom] + PX_PER_UNIT[zoom] / 2
}

'use client'

/**
 * Task bars, milestones, and grid rows inside the chart area.
 */
import type { Project, Section, Tag, Task, User } from '../../../types'
import { BaselineLayer } from './BaselineLayer'
import { Milestone } from './Milestone'
import { TaskBar } from './TaskBar'
import { PX_PER_UNIT, ROW_H } from './constants'
import { taskBarColor } from './taskBarColors'
import { isBarVisible } from './timelineUtils'
import type { DragMode } from './useTimelineDnd'
import { barGeometry, milestoneX } from './useTimelineDnd'
import type { BaselineSnapshot, ColorBy, TimelineRow, ZoomLevel } from './types'

type DndApi = {
  linkFromId: string | null
  linkHoverId: string | null
  setLinkHoverId: (id: string) => void
  onPointerDown: (e: React.PointerEvent, taskId: string, mode: DragMode) => void
}

type Props = {
  project: Project
  rows: TimelineRow[]
  tasks: Task[]
  sections: Section[]
  users: User[]
  tags: Tag[]
  rangeStart: Date
  zoom: ZoomLevel
  width: number
  colorBy: ColorBy
  criticalIds: Set<string>
  showBaseline: boolean
  baseline: BaselineSnapshot | null
  taskRowIndex: Map<string, number>
  scrollLeft: number
  viewportW: number
  dnd: DndApi
  onOpenTask: (id: string) => void
}

export function TimelineChartRows(props: Props) {
  const {
    project, rows, tasks, sections, users, tags, rangeStart, zoom, width, colorBy,
    criticalIds, showBaseline, baseline, taskRowIndex, scrollLeft, viewportW, dnd, onOpenTask,
  } = props

  return (
    <>
      {showBaseline && baseline ? (
        <BaselineLayer tasks={tasks} baseline={baseline} taskRowIndex={taskRowIndex} rangeStart={rangeStart} zoom={zoom} />
      ) : null}

      {rows.map((row, i) => {
        if (row.kind !== 'task') {
          return (
            <div
              key={row.kind === 'section' ? `s-${row.sectionId}` : `l-${row.key}`}
              className="absolute border-b"
              style={{ top: i * ROW_H, height: ROW_H, width, borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            />
          )
        }

        const task = row.task
        const top = row.rowIndex * ROW_H
        const color = taskBarColor(task, colorBy, project, sections, users, tags)
        const critical = criticalIds.has(task.id)

        if (task.resourceSubtype === 'milestone') {
          const x = milestoneX(task, rangeStart, zoom)
          if (x === null || !isBarVisible(x, PX_PER_UNIT[zoom], scrollLeft, viewportW)) return null
          return (
            <Milestone key={task.id} task={task} x={x} rowTop={top} color={color} critical={critical} onOpen={() => onOpenTask(task.id)} />
          )
        }

        const geom = barGeometry(task, rangeStart, zoom)
        if (!geom || !isBarVisible(geom.left, geom.width, scrollLeft, viewportW)) return null

        return (
          <TaskBar
            key={task.id}
            task={task}
            left={geom.left}
            width={geom.width}
            rowTop={top}
            color={color}
            critical={critical}
            assignee={users.find((u) => u.id === task.assigneeId)}
            linkActive={dnd.linkFromId === task.id || dnd.linkHoverId === task.id}
            linking={Boolean(dnd.linkFromId)}
            onOpen={() => onOpenTask(task.id)}
            onPointerDown={(e, mode) => dnd.onPointerDown(e, task.id, mode)}
            onLinkTargetEnter={() => dnd.setLinkHoverId(task.id)}
          />
        )
      })}
    </>
  )
}

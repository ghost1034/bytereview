'use client'

/**
 * Shared timeline chart renderer — axis, bars, dependencies, baseline.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isWeekend, startOfDay } from 'date-fns'
import type { Project, Section, Tag, Task, User } from '../../../types'
import { DependencyArrow } from './DependencyArrow'
import { TimeAxis } from './TimeAxis'
import { TimelineChartRows } from './TimelineChartRows'
import { TimelineLeftRail } from './TimelineLeftRail'
import { PX_PER_UNIT, ROW_H } from './constants'
import { buildRows } from './rowBuilder'
import { chartWidth, dateToX, defaultRange } from './timelineUtils'
import { useDependencies } from './useDependencies'
import { useTimelineDnd } from './useTimelineDnd'
import type { BaselineSnapshot, ColorBy, RowsBy, TimelineRow, ZoomLevel } from './types'

type Props = {
  project: Project
  variant?: 'timeline' | 'gantt'
  tasks: Task[]
  sections: Section[]
  users: User[]
  tags: Tag[]
  zoom: ZoomLevel
  panX: number
  setPanX: (x: number) => void
  onZoomIn: () => void
  onZoomOut: () => void
  colorBy: ColorBy
  rowsBy: RowsBy
  autoShift: boolean
  highlightCriticalPath: boolean
  showBaseline: boolean
  baseline: BaselineSnapshot | null
  railWidth: number
  railCollapsed: boolean
  collapsedSections: Set<string>
  onToggleSection: (id: string) => void
  actorId: string | null
  onOpenTask: (id: string) => void
  onLinkError?: (msg: string | null) => void
}

export function TimelineRenderer(props: Props) {
  const {
    project, variant = 'timeline', tasks, sections, users, tags, zoom, panX, setPanX,
    onZoomIn, onZoomOut, colorBy, rowsBy, autoShift, highlightCriticalPath,
    showBaseline, baseline, railWidth, railCollapsed, collapsedSections,
    onToggleSection, actorId, onOpenTask, onLinkError,
  } = props

  const scrollRef = useRef<HTMLDivElement>(null)
  const panStart = useRef<{ x: number; pan: number } | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportW, setViewportW] = useState(800)

  const rows: TimelineRow[] = useMemo(
    () => buildRows(tasks, variant, rowsBy, sections, project.id, collapsedSections, users, tags),
    [collapsedSections, project.id, rowsBy, sections, tags, tasks, users, variant]
  )

  const taskRowIndex = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((r) => { if (r.kind === 'task') map.set(r.task.id, r.rowIndex) })
    return map
  }, [rows])

  const range = useMemo(() => defaultRange(tasks), [tasks])
  const width = chartWidth(range.start, range.end, zoom)
  const height = rows.length * ROW_H
  const todayX = dateToX(startOfDay(new Date()), range.start, zoom)

  const dnd = useTimelineDnd({ zoom, autoShift, actorId, tasks, onLinkError: (m) => onLinkError?.(m) })
  const deps = useDependencies(tasks, taskRowIndex, range.start, zoom, highlightCriticalPath, actorId)

  const weekendBands = useMemo(() => {
    if (zoom !== 'day') return []
    const days: Date[] = []
    let cur = range.start
    while (cur <= range.end) {
      if (isWeekend(cur)) days.push(cur)
      cur = new Date(cur.getTime() + 86400000)
    }
    return days
  }, [range.end, range.start, zoom])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setScrollLeft(el.scrollLeft)
    setViewportW(el.clientWidth)
  }, [])

  const onPanStart = useCallback((clientX: number) => { panStart.current = { x: clientX, pan: panX } }, [panX])
  const onPanMove = useCallback((e: React.PointerEvent) => {
    if (!panStart.current) return
    setPanX(panStart.current.pan + (e.clientX - panStart.current.x))
  }, [setPanX])
  const onPanEnd = useCallback(() => { panStart.current = null }, [])

  const onWheelZoom = useCallback((deltaY: number, ctrl: boolean) => {
    if (ctrl) { if (deltaY < 0) onZoomIn(); else onZoomOut() }
    else if (scrollRef.current) scrollRef.current.scrollLeft += deltaY
  }, [onZoomIn, onZoomOut])

  useEffect(() => {
    onScroll()
  }, [onScroll, width, rows.length])

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="max-h-[calc(100vh-240px)] overflow-y-auto">
      <div className="flex" onPointerMove={dnd.onPointerMove} onPointerUp={dnd.onPointerUp}>
        {!railCollapsed ? (
          <TimelineLeftRail
            rows={rows}
            width={railWidth}
            users={users}
            criticalIds={deps.criticalIds}
            highlightCriticalPath={highlightCriticalPath}
            onOpenTask={onOpenTask}
            onToggleSection={onToggleSection}
            collapsedSections={collapsedSections}
            onAddDate={(id) => void dnd.quickAddDate(id)}
          />
        ) : null}

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto" onScroll={onScroll}>
          <div style={{ width: width + 40, minWidth: '100%', transform: `translateX(${panX}px)` }}>
            <TimeAxis rangeStart={range.start} rangeEnd={range.end} zoom={zoom} todayX={todayX} onPanStart={onPanStart} onWheelZoom={onWheelZoom} />
            <div className="relative" style={{ height }} onPointerMove={onPanMove} onPointerUp={onPanEnd}>
              {weekendBands.map((day) => (
                <div
                  key={day.toISOString()}
                  className="pointer-events-none absolute top-0 bottom-0"
                  style={{ left: dateToX(day, range.start, zoom), width: PX_PER_UNIT[zoom], background: 'hsl(var(--surface-muted))', opacity: 0.4 }}
                />
              ))}
              <DependencyArrow
                arrows={deps.arrows}
                criticalIds={deps.criticalIds}
                hoveredEdge={deps.hoveredEdge}
                setHoveredEdge={deps.setHoveredEdge}
                onRemove={(f, t) => void deps.removeEdge(f, t)}
                width={width}
                height={height}
              />
              <TimelineChartRows
                project={project}
                rows={rows}
                tasks={tasks}
                sections={sections}
                users={users}
                tags={tags}
                rangeStart={range.start}
                zoom={zoom}
                width={width}
                colorBy={colorBy}
                criticalIds={deps.criticalIds}
                showBaseline={showBaseline}
                baseline={baseline}
                taskRowIndex={taskRowIndex}
                scrollLeft={scrollLeft}
                viewportW={viewportW}
                dnd={dnd}
                onOpenTask={onOpenTask}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

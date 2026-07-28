'use client'

/**
 * Dependency graph helpers for timeline rendering and removal.
 */
import { useCallback, useMemo, useState } from 'react'
import { computeCriticalPath, removeDependency } from '../../../lib/dependencies'
import type { Task } from '../../../types'
import { buildDependencyArrowPath } from './dependencyArrowPath'
import type { DependencyLink, ZoomLevel } from './types'

type ArrowGeom = DependencyLink & { path: string; conflict: boolean }

/** Build dependency links and critical-path set for visible tasks. */
export function useDependencies(
  tasks: Task[],
  taskRowIndex: Map<string, number>,
  rangeStart: Date,
  zoom: ZoomLevel,
  highlightCriticalPath: boolean,
  actorId: string | null
) {
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [menuEdge, setMenuEdge] = useState<{ fromId: string; toId: string } | null>(null)

  const criticalIds = useMemo(
    () => (highlightCriticalPath ? computeCriticalPath(tasks) : new Set<string>()),
    [highlightCriticalPath, tasks]
  )

  const arrows: ArrowGeom[] = useMemo(() => {
    const out: ArrowGeom[] = []
    tasks.forEach((task) => {
      task.dependencyIds.forEach((depId) => {
        const from = tasks.find((t) => t.id === depId)
        if (!from) return
        const fromRow = taskRowIndex.get(from.id)
        const toRow = taskRowIndex.get(task.id)
        if (fromRow === undefined || toRow === undefined) return
        const geom = buildDependencyArrowPath(from, task, fromRow, toRow, rangeStart, zoom)
        if (!geom) return
        out.push({
          fromId: from.id,
          toId: task.id,
          fromRow,
          toRow,
          path: geom.path,
          conflict: geom.conflict,
        })
      })
    })
    return out
  }, [rangeStart, taskRowIndex, tasks, zoom])

  const removeEdge = useCallback(
    async (fromId: string, toId: string) => {
      if (!actorId) return
      await removeDependency(toId, fromId, actorId)
      setMenuEdge(null)
    },
    [actorId]
  )

  return { arrows, criticalIds, hoveredEdge, setHoveredEdge, menuEdge, setMenuEdge, removeEdge }
}

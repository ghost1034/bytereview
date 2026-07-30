'use client'

/**
 * Persisted timeline UI state (zoom, pan, toggles, baseline) per project + view.
 */
import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import type { BaselineSnapshot, ColorBy, RowsBy, TimelineUiState, ZoomLevel } from './types'
import { RAIL_W_DEFAULT } from './constants'

const DEFAULT: TimelineUiState = {
  zoom: 'week',
  panX: 0,
  colorBy: 'section',
  rowsBy: 'none',
  autoShift: true,
  highlightCriticalPath: false,
  showBaseline: false,
  baseline: null,
  railCollapsed: false,
  railWidth: RAIL_W_DEFAULT,
  collapsedSectionIds: [],
}

/** Stable default for selectors — do not mutate. */
const DEFAULT_SNAPSHOT: TimelineUiState = { ...DEFAULT }

type Store = {
  byKey: Record<string, Partial<TimelineUiState>>
  patch: (key: string, patch: Partial<TimelineUiState>) => void
}

const useTimelineStore = create<Store>()(
  persist(
    (set) => ({
      byKey: {},
      patch: (key, patch) =>
        set((s) => ({
          byKey: { ...s.byKey, [key]: { ...s.byKey[key], ...patch } },
        })),
    }),
    { name: 'tasklytic:timelineUi' }
  )
)

function storeKey(projectId: string): string {
  return `${projectId}:timeline`
}

/** Hook for persisted timeline chrome state. */
export function useTimelineState(projectId: string) {
  const key = storeKey(projectId)
  const state = useTimelineStore(
    useShallow((s) => {
      const stored = s.byKey[key]
      return stored ? { ...DEFAULT_SNAPSHOT, ...stored } : DEFAULT_SNAPSHOT
    })
  )
  const patchRaw = useTimelineStore((s) => s.patch)

  const patch = useCallback(
    (p: Partial<TimelineUiState>) => patchRaw(key, p),
    [key, patchRaw]
  )

  const setZoom = useCallback(
    (zoom: ZoomLevel) => patch({ zoom }),
    [patch]
  )

  const zoomIn = useCallback(() => {
    const order: ZoomLevel[] = ['year', 'quarter', 'month', 'week', 'day']
    const i = order.indexOf(state.zoom)
    if (i < order.length - 1) patch({ zoom: order[i + 1] })
  }, [patch, state.zoom])

  const zoomOut = useCallback(() => {
    const order: ZoomLevel[] = ['year', 'quarter', 'month', 'week', 'day']
    const i = order.indexOf(state.zoom)
    if (i > 0) patch({ zoom: order[i - 1] })
  }, [patch, state.zoom])

  const toggleSection = useCallback(
    (sectionId: string) => {
      const set = new Set(state.collapsedSectionIds)
      if (set.has(sectionId)) set.delete(sectionId)
      else set.add(sectionId)
      patch({ collapsedSectionIds: [...set] })
    },
    [patch, state.collapsedSectionIds]
  )

  const collapsedSet = useMemo(() => new Set(state.collapsedSectionIds), [state.collapsedSectionIds])

  const setColorBy = useCallback((colorBy: ColorBy) => patch({ colorBy }), [patch])
  const setRowsBy = useCallback((rowsBy: RowsBy) => patch({ rowsBy }), [patch])
  const setAutoShift = useCallback((autoShift: boolean) => patch({ autoShift }), [patch])
  const setHighlightCriticalPath = useCallback(
    (highlightCriticalPath: boolean) => patch({ highlightCriticalPath }),
    [patch]
  )
  const setShowBaseline = useCallback((showBaseline: boolean) => patch({ showBaseline }), [patch])
  const setRailCollapsed = useCallback((railCollapsed: boolean) => patch({ railCollapsed }), [patch])
  const setRailWidth = useCallback((railWidth: number) => patch({ railWidth }), [patch])
  const setPanX = useCallback((panX: number) => patch({ panX }), [patch])
  const saveBaseline = useCallback(
    (baseline: BaselineSnapshot) => patch({ baseline, showBaseline: true }),
    [patch]
  )
  const clearBaseline = useCallback(() => patch({ baseline: null, showBaseline: false }), [patch])

  return {
    ...state,
    collapsedSet,
    patch,
    setZoom,
    zoomIn,
    zoomOut,
    toggleSection,
    setColorBy,
    setRowsBy,
    setAutoShift,
    setHighlightCriticalPath,
    setShowBaseline,
    setRailCollapsed,
    setRailWidth,
    setPanX,
    saveBaseline,
    clearBaseline,
  }
}

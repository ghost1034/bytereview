'use client'

/**
 * Multi-select state for List view rows with shift-range support.
 */
import { useCallback, useState } from 'react'

export function useListSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)

  const clear = useCallback(() => {
    setSelected(new Set())
    setAnchorId(null)
  }, [])

  const toggle = useCallback(
    (taskId: string, orderedIds: string[], shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (shiftKey && anchorId && orderedIds.includes(anchorId)) {
          const a = orderedIds.indexOf(anchorId)
          const b = orderedIds.indexOf(taskId)
          if (a !== -1 && b !== -1) {
            const [start, end] = a < b ? [a, b] : [b, a]
            orderedIds.slice(start, end + 1).forEach((id) => next.add(id))
            return next
          }
        }
        if (next.has(taskId)) next.delete(taskId)
        else next.add(taskId)
        return next
      })
      if (!shiftKey) setAnchorId(taskId)
    },
    [anchorId]
  )

  const toggleGroup = useCallback((taskIds: string[]) => {
    setSelected((prev) => {
      const allSelected = taskIds.length > 0 && taskIds.every((id) => prev.has(id))
      const next = new Set(prev)
      taskIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }, [])

  return { selected, toggle, toggleGroup, clear, count: selected.size }
}

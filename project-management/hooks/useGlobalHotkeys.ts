'use client'

/**
 * Global keyboard shortcuts for Tasklytic (⌘K, c, g+h, g+m, g+i, [, ], T, Shift+T, ?).
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceContext } from './useWorkspaceContext'

type Options = {
  onQuickAdd?: () => void
  onCollapseSidebar?: () => void
  onExpandSidebar?: () => void
  onToggleTimer?: () => void
  onShowShortcuts?: () => void
  onOpenCommand?: () => void
}

export function useGlobalHotkeys(options: Options = {}) {
  const router = useRouter()
  const { workspaceId } = useWorkspaceContext()
  const {
    onQuickAdd,
    onCollapseSidebar,
    onExpandSidebar,
    onToggleTimer,
    onShowShortcuts,
    onOpenCommand,
  } = options

  useEffect(() => {
    const base = workspaceId ? `/dashboard/project-management/w/${workspaceId}` : null
    let pendingG = false
    let gTimer: ReturnType<typeof setTimeout> | null = null

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenCommand?.()
        return
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        onShowShortcuts?.()
        return
      }

      if (e.key === '[' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        onCollapseSidebar?.()
        return
      }

      if (e.key === ']' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        onExpandSidebar?.()
        return
      }

      if (e.key.toLowerCase() === 't' && e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        onToggleTimer?.()
        return
      }

      if (e.key === 'c' && !e.metaKey && !e.ctrlKey && onQuickAdd) {
        e.preventDefault()
        onQuickAdd()
        return
      }

      if (e.key === 'g') {
        pendingG = true
        if (gTimer) clearTimeout(gTimer)
        gTimer = setTimeout(() => {
          pendingG = false
        }, 800)
        return
      }

      if (pendingG && base) {
        pendingG = false
        if (gTimer) clearTimeout(gTimer)
        if (e.key === 'h') router.push(`${base}/home`)
        if (e.key === 'm') router.push(`${base}/my-tasks`)
        if (e.key === 'i') router.push(`${base}/inbox`)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCollapseSidebar, onExpandSidebar, onOpenCommand, onQuickAdd, onShowShortcuts, onToggleTimer, router, workspaceId])
}

'use client'

/**
 * Portal component — render tab navigation into #topbar-tabs (step 04 shell).
 */
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = { children: ReactNode }

/** Mount children into the Tasklytic topbar tabs slot when available. */
export function TopbarTabsPortal({ children }: Props) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.getElementById('topbar-tabs')
    if (el) {
      el.classList.add('flex')
      setTarget(el)
    }
    return () => {
      if (el) el.classList.remove('flex')
    }
  }, [])

  if (!target) return null
  return createPortal(children, target)
}

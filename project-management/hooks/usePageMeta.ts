'use client'

/** Sets page breadcrumbs in the Tasklytic topbar. */
import { useEffect, useRef } from 'react'
import { useUiStore, type Crumb } from '../stores/auth'

function crumbsEqual(a: Crumb[], b: Crumb[]): boolean {
  if (a.length !== b.length) return false
  return a.every((c, i) => c.label === b[i].label && c.href === b[i].href)
}

export function usePageMeta(meta: { title?: string; breadcrumbs?: Crumb[] }) {
  const setBreadcrumbs = useUiStore((s) => s.setBreadcrumbs)
  const crumbs = meta.breadcrumbs ?? []
  const prevRef = useRef<Crumb[]>(crumbs)

  useEffect(() => {
    if (crumbsEqual(prevRef.current, crumbs)) return
    prevRef.current = crumbs
    setBreadcrumbs(crumbs)
    return () => setBreadcrumbs([])
  }, [crumbs, setBreadcrumbs])
}

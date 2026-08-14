'use client'

/** Sets page breadcrumbs in the Tasklytic topbar. */
import { useEffect, useRef } from 'react'
import { useUiStore, type Crumb } from '../stores/auth'

export function usePageMeta(meta: { title?: string; breadcrumbs?: Crumb[] }) {
  const setBreadcrumbs = useUiStore((s) => s.setBreadcrumbs)
  const crumbs = meta.breadcrumbs ?? []
  const crumbsRef = useRef<Crumb[]>(crumbs)
  crumbsRef.current = crumbs
  const crumbsKey = crumbs.map((crumb) => `${crumb.label}\u0000${crumb.href ?? ''}`).join('\u0001')

  useEffect(() => {
    setBreadcrumbs(crumbsRef.current)
    return () => setBreadcrumbs([])
  }, [crumbsKey, setBreadcrumbs])
}

'use client'

/**
 * URL sync helpers for ?task= search param and full-screen task routes.
 */
import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ProjectView } from '../../types'

/** Build a project task URL while preserving the active view and other query params. */
export function buildProjectTaskHref(
  basePath: string,
  taskId: string,
  currentParams: URLSearchParams,
  view: ProjectView
): string {
  const params = new URLSearchParams(currentParams.toString())
  params.set('view', view)
  params.set('task', taskId)
  return `${basePath}?${params.toString()}`
}

/** Open a task from a project view without dropping ?view= or other params. */
export function useOpenProjectTask(basePath: string, view: ProjectView) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const openTask = useCallback(
    (taskId: string) => {
      router.push(buildProjectTaskHref(basePath, taskId, searchParams, view))
    },
    [basePath, router, searchParams, view]
  )

  return openTask
}

/** Read active task id from ?task= or an explicit override (full-screen route). */
export function useTaskDetailUrl(explicitTaskId?: string | null) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const taskId = explicitTaskId ?? searchParams.get('task')

  const openTask = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('task', id)
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams]
  )

  const closeTask = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('task')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [pathname, router, searchParams])

  const copyTaskLink = useCallback(
    (id: string, workspaceId: string) => {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const url = `${origin}/dashboard/tasklytic/w/${workspaceId}/tasks/${id}`
      void navigator.clipboard.writeText(url)
      return url
    },
    []
  )

  const fullScreenHref = useCallback(
    (id: string, workspaceId: string) => `/dashboard/tasklytic/w/${workspaceId}/tasks/${id}`,
    []
  )

  return { taskId, openTask, closeTask, copyTaskLink, fullScreenHref }
}

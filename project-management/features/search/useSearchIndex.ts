'use client'

/**
 * Reactive hook rebuilding the workspace search index on entity changes.
 */
import { useMemo } from 'react'
import type { Comment, Project, Task } from '../../types'
import { getSearchIndex } from '../../lib/search/workspaceIndex'

export function useSearchIndex(tasks: Task[], projects: Project[], comments: Comment[] = []) {
  return useMemo(() => {
    const index = getSearchIndex(tasks, projects, comments)
    return index
  }, [tasks, projects, comments])
}

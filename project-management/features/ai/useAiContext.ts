'use client'

/**
 * Route-aware AI context — reads project/task/goal ids from URL + UI store.
 */
import { useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useUiStore } from '../../stores/auth'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import type { AiContextScope } from '../../lib/ai/types'

const PROJECT_RE = /\/projects\/([^/?]+)/
const TASK_RE = /\/tasks\/([^/?]+)/
const GOAL_RE = /\/goals\/([^/?]+)/
const PORTFOLIO_RE = /\/portfolios\/([^/?]+)/

/** Derive the best AI context scope from the current route. */
export function useAiContextScope(): AiContextScope | null {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const taskDetailId = useUiStore((s) => s.taskDetailId)
  const { workspaceId } = useWorkspaceContext()

  return useMemo(() => {
    if (!workspaceId) return null
    const taskParam = searchParams.get('task')
    const taskMatch = pathname?.match(TASK_RE)
    const taskId = taskDetailId ?? taskParam ?? taskMatch?.[1]
    if (taskId) return { type: 'task', taskId }

    const projectMatch = pathname?.match(PROJECT_RE)
    if (projectMatch?.[1]) return { type: 'project', projectId: projectMatch[1] }

    const goalMatch = pathname?.match(GOAL_RE)
    if (goalMatch?.[1]) return { type: 'goal', goalId: goalMatch[1] }

    const portfolioMatch = pathname?.match(PORTFOLIO_RE)
    if (portfolioMatch?.[1]) return { type: 'portfolio', portfolioId: portfolioMatch[1] }

    return { type: 'workspace', workspaceId }
  }, [pathname, searchParams, taskDetailId, workspaceId])
}

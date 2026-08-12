'use client'

/** Context chip row above the AI input. */
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  useGoalsStore,
  useDashboardsStore,
  usePortfoliosStore,
  useProjectsStore,
  useTasksStore,
} from '../../stores/entities'
import type { AiContextScope } from '../../lib/ai/types'

type Props = {
  scope: AiContextScope | null
  onClear?: () => void
}

function labelForScope(scope: AiContextScope): string {
  switch (scope.type) {
    case 'workspace':
      return 'Workspace'
    case 'project': {
      const p = useProjectsStore.getState().getById(scope.projectId)
      return p?.name ?? 'Project'
    }
    case 'task': {
      const t = useTasksStore.getState().getById(scope.taskId)
      return t?.name ?? 'Task'
    }
    case 'goal': {
      const g = useGoalsStore.getState().getById(scope.goalId)
      return g?.name ?? 'Goal'
    }
    case 'portfolio': {
      const pf = usePortfoliosStore.getState().getById(scope.portfolioId)
      return pf?.name ?? 'Portfolio'
    }
    case 'dashboard': {
      const dashboard = useDashboardsStore.getState().getById(scope.dashboardId)
      return dashboard?.name ?? 'Dashboard'
    }
  }
}

export function AiContextChips({ scope, onClear }: Props) {
  if (!scope || scope.type === 'workspace') return null
  const label = labelForScope(scope)
  return (
    <div className="flex flex-wrap gap-1.5 px-3 pt-2">
      <Badge variant="secondary" className="gap-1 rounded-full bg-aurora/40 pr-1">
        <span className="max-w-[200px] truncate">{label}</span>
        {onClear ? (
          <button type="button" aria-label="Clear context" onClick={onClear} className="rounded-full p-0.5 hover:bg-black/5">
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </Badge>
    </div>
  )
}

'use client'

/** Workload page — workspace-scoped capacity heatmap. */
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { WorkloadView } from './WorkloadView'

/** Entry point for /w/:workspaceId/workload. */
export function WorkloadPage() {
  const { workspaceId } = useWorkspaceContext()

  usePageMeta({ breadcrumbs: [{ label: 'Workload' }] })

  if (!workspaceId) return null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl">Workload</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
          Per-person capacity across your projects — spot overload before it becomes a blocker.
        </p>
      </div>
      <WorkloadView workspaceId={workspaceId} />
    </div>
  )
}

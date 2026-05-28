'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { useToast } from '@/hooks/use-toast'
import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import {
  useAnalyticsReconciliations,
  useDeleteAnalyticsReconciliation,
} from '@/hooks/useAnalyticsReconciliation'
import {
  useAnalyticsVariances,
  useDeleteAnalyticsVariance,
} from '@/hooks/useAnalyticsVariance'
import { AI_CONTEXT_MAX_ITEMS, useAIContext, type DashboardContext } from '@/lib/analytics/aiContext'

import { DashboardKpiCards } from './DashboardKpiCards'
import { DashboardProjectsTable } from './DashboardProjectsTable'
import {
  countByBucket,
  toUnifiedFromReconciliation,
  toUnifiedFromVariance,
  type UnifiedProject,
} from './types'

const MODULE_ROUTE: Record<UnifiedProject['moduleId'], string> = {
  variance: '/dashboard/analytics/variance',
  reconciliation: '/dashboard/analytics/reconciliation',
}

export function DashboardModule() {
  const router = useRouter()
  const { toast } = useToast()

  const variancesQuery = useAnalyticsVariances()
  const reconciliationsQuery = useAnalyticsReconciliations()
  const clientsQuery = useAnalyticsClients()

  const deleteVariance = useDeleteAnalyticsVariance()
  const deleteReconciliation = useDeleteAnalyticsReconciliation()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const clientNameById = useMemo(
    () => new Map((clientsQuery.data?.clients ?? []).map((c) => [c.id, c.name])),
    [clientsQuery.data],
  )

  const projects = useMemo<UnifiedProject[]>(() => {
    const variance = (variancesQuery.data?.analyses ?? []).map((row) =>
      toUnifiedFromVariance(row, clientNameById),
    )
    const reconciliation = (reconciliationsQuery.data?.reconciliations ?? []).map((row) =>
      toUnifiedFromReconciliation(row, clientNameById),
    )
    return [...variance, ...reconciliation].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    )
  }, [variancesQuery.data, reconciliationsQuery.data, clientNameById])

  const counts = useMemo(() => countByBucket(projects), [projects])

  const aiContext = useMemo<DashboardContext>(
    () => ({
      dashboard: {
        counts,
        items: projects.slice(0, AI_CONTEXT_MAX_ITEMS).map((p) => ({
          id: p.id,
          name: p.name,
          module: p.moduleLabel,
          status: p.status,
          clientName: p.clientName,
          updatedAt: p.updatedAt.toISOString(),
        })),
      },
    }),
    [counts, projects],
  )
  useAIContext(aiContext)

  const isLoading =
    variancesQuery.isLoading || reconciliationsQuery.isLoading || clientsQuery.isLoading

  const handleRowClick = (project: UnifiedProject) => {
    router.push(`${MODULE_ROUTE[project.moduleId]}?id=${encodeURIComponent(project.id)}`)
  }

  const handleConfirmDelete = async () => {
    if (selectedIds.length === 0) return
    setDeleting(true)
    const byId = new Map(projects.map((p) => [p.id, p]))
    const results = await Promise.allSettled(
      selectedIds.map((id) => {
        const project = byId.get(id)
        if (!project) return Promise.resolve()
        if (project.moduleId === 'variance') return deleteVariance.mutateAsync(id)
        return deleteReconciliation.mutateAsync(id)
      }),
    )
    setDeleting(false)
    setDeleteOpen(false)
    setSelectedIds([])

    const failed = results.filter((r) => r.status === 'rejected').length
    const succeeded = results.length - failed
    if (failed === 0) {
      toast({
        title: 'Projects deleted',
        description: `${succeeded} project${succeeded === 1 ? '' : 's'} removed.`,
      })
    } else {
      toast({
        title: 'Some deletes failed',
        description: `${succeeded} succeeded, ${failed} failed. Try again.`,
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return <LoadingState variant="table" label="Loading projects" />
  }

  return (
    <div className="space-y-8 pb-12">
      <DashboardKpiCards counts={counts} />

      <DashboardProjectsTable
        projects={projects}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={handleRowClick}
        onDeleteSelected={() => setDeleteOpen(true)}
      />

      <AlertDialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete projects</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.length} project
              {selectedIds.length === 1 ? '' : 's'}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

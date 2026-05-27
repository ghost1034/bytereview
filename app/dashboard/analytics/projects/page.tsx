'use client'

import { useMemo, useState } from 'react'
import { FolderKanban, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { ProjectModal } from '@/components/analytics/ProjectModal'
import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import { useAnalyticsProjects, useDeleteAnalyticsProject } from '@/hooks/useAnalyticsProjects'
import { useAnalyticsFirm } from '@/hooks/useAnalyticsTeam'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { AI_CONTEXT_MAX_ITEMS, useAIContext, type ProjectsContext } from '@/lib/analytics/aiContext'
import {
  PROJECT_MODULE_LABELS,
  PROJECT_STATUS_BADGE_CLASS,
  PROJECT_STATUS_LABELS,
} from '@/lib/analytics/labels'
import type {
  AnalyticsProject,
  AnalyticsProjectModule,
  AnalyticsProjectStatus,
} from '@/lib/analytics/types'

export default function AnalyticsProjectsPage() {
  const { data: projectsData, isLoading } = useAnalyticsProjects()
  const { data: clientsData } = useAnalyticsClients()
  const { data: firmData } = useAnalyticsFirm()
  const deleteMutation = useDeleteAnalyticsProject()
  const { toast } = useToast()

  const projects: AnalyticsProject[] = projectsData?.projects ?? []
  const clients = clientsData?.clients ?? []
  const members = firmData?.members ?? []

  // Build lookup maps from the stable query results (not the derived arrays,
  // which would be new references each render).
  const clientNameById = useMemo(
    () => new Map((clientsData?.clients ?? []).map((c) => [c.id, c.name])),
    [clientsData],
  )
  const memberNameById = useMemo(
    () =>
      new Map((firmData?.members ?? []).map((m) => [m.user_id, m.display_name || m.email])),
    [firmData],
  )

  // Publish a compact snapshot to the floating AI Assistant, resolving client
  // and assignee names so the assistant can answer in human terms.
  const aiContext = useMemo<ProjectsContext>(
    () => ({
      projects: {
        count: projectsData?.projects?.length ?? 0,
        items: (projectsData?.projects ?? []).slice(0, AI_CONTEXT_MAX_ITEMS).map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          clientName: p.client_id ? clientNameById.get(p.client_id) ?? null : null,
          module: p.module,
          dueDate: p.due_date,
          assignee: p.assigned_to_user_id
            ? memberNameById.get(p.assigned_to_user_id) ?? null
            : null,
        })),
      },
    }),
    [projectsData, clientNameById, memberNameById],
  )
  useAIContext(aiContext)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<AnalyticsProject | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<AnalyticsProject | null>(null)

  const handleCreate = () => {
    setEditingProject(null)
    setModalOpen(true)
  }

  const handleEdit = (project: AnalyticsProject) => {
    setEditingProject(project)
    setModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!projectToDelete) return
    try {
      await deleteMutation.mutateAsync(projectToDelete.id)
      toast({ title: 'Project deleted', description: `${projectToDelete.name} has been removed.` })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete project.',
        variant: 'destructive',
      })
    } finally {
      setProjectToDelete(null)
    }
  }

  const columns: ColumnDef<AnalyticsProject>[] = [
    {
      header: 'Project',
      accessorKey: 'name',
      sortable: true,
      cell: (_value, row) => <span className="font-semibold text-foreground">{row.name}</span>,
    },
    {
      header: 'Client',
      accessorKey: 'client_id',
      cell: (value) =>
        (value && clientNameById.get(value as string)) || (
          <span className="text-foreground-subtle">—</span>
        ),
    },
    {
      header: 'Module',
      accessorKey: 'module',
      cell: (value) => (
        <Badge variant="secondary">
          {PROJECT_MODULE_LABELS[value as AnalyticsProjectModule] ?? value}
        </Badge>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (value) => {
        const status = value as AnalyticsProjectStatus
        return (
          <Badge className={cn(PROJECT_STATUS_BADGE_CLASS[status])}>
            {PROJECT_STATUS_LABELS[status] ?? status}
          </Badge>
        )
      },
    },
    {
      header: 'Assigned to',
      accessorKey: 'assigned_to_user_id',
      cell: (value) =>
        (value && memberNameById.get(value as string)) || (
          <span className="text-foreground-subtle">Unassigned</span>
        ),
    },
    {
      header: 'Due date',
      accessorKey: 'due_date',
      sortable: true,
      cell: (value) =>
        value ? (
          new Date(value as string).toLocaleDateString()
        ) : (
          <span className="text-foreground-subtle">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="Track engagements across your firm’s clients and analytics modules."
        actions={
          <Button onClick={handleCreate}>
            <Plus className="mr-1.5 size-4" aria-hidden />
            New project
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState variant="table" label="Loading projects" />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to organize work across modules and clients."
          action={
            <Button onClick={handleCreate}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              Create your first project
            </Button>
          }
        />
      ) : (
        <DataTable
          data={projects}
          columns={columns}
          searchPlaceholder="Search projects…"
          rowActions={(row) => (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${row.name}`}
                onClick={() => handleEdit(row)}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${row.name}`}
                onClick={() => setProjectToDelete(row)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        />
      )}

      <ProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        project={editingProject}
        clients={clients}
        members={members}
      />

      <AlertDialog
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{projectToDelete?.name}&rdquo;? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                'Delete project'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

'use client'

import { Building2, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'

import type { UnifiedProject } from './types'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  // variance (TitleCase)
  Draft: 'secondary',
  'In Review': 'outline',
  Approved: 'default',
  Finalized: 'default',
  // reconciliation (snake_case)
  draft: 'secondary',
  in_review: 'outline',
  approved: 'default',
  finalized: 'default',
}

interface DashboardProjectsTableProps {
  projects: UnifiedProject[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onRowClick: (project: UnifiedProject) => void
  onDeleteSelected: () => void
}

export function DashboardProjectsTable({
  projects,
  selectedIds,
  onSelectionChange,
  onRowClick,
  onDeleteSelected,
}: DashboardProjectsTableProps) {
  const columns: ColumnDef<UnifiedProject>[] = [
    {
      header: 'Client',
      accessorKey: 'clientName',
      sortable: true,
      cell: (value) => (
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-surface-muted text-foreground-subtle">
            <Building2 className="size-4" aria-hidden />
          </div>
          <span className="font-semibold text-foreground">{value as string}</span>
        </div>
      ),
    },
    {
      header: 'Project Name',
      accessorKey: 'name',
      sortable: true,
      cell: (value) => (
        <span className="font-medium text-foreground">{(value as string) || 'Unnamed Project'}</span>
      ),
    },
    {
      header: 'Module',
      accessorKey: 'moduleLabel',
      sortable: true,
      cell: (value) => <Badge variant="secondary">{value as string}</Badge>,
    },
    {
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (value) => {
        const status = (value as string) ?? ''
        return <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{status}</Badge>
      },
    },
    {
      header: 'Last Updated',
      accessorKey: 'updatedAt',
      sortable: true,
      cell: (value) => (
        <span className="text-sm text-foreground-subtle">
          {(value as Date).toLocaleDateString()}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      data={projects}
      columns={columns}
      title="All Projects"
      searchPlaceholder="Search projects or clients…"
      onRowClick={onRowClick}
      enableSelection
      selectedRows={selectedIds}
      onSelectionChange={(ids) => onSelectionChange(ids.map(String))}
      actions={
        selectedIds.length > 0 ? (
          <Button variant="destructive" size="sm" onClick={onDeleteSelected}>
            <Trash2 className="mr-1.5 size-4" aria-hidden />
            Delete Selected ({selectedIds.length})
          </Button>
        ) : null
      }
    />
  )
}

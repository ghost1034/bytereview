'use client'

import { useMemo, useState } from 'react'
import { Building2, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

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
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/loading-state'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { ClientModal } from '@/components/analytics/ClientModal'
import { useAnalyticsClients, useDeleteAnalyticsClient } from '@/hooks/useAnalyticsClients'
import { useToast } from '@/hooks/use-toast'
import { exportRows } from '@/lib/analytics/exportData'
import { AI_CONTEXT_MAX_ITEMS, useAIContext, type ClientsContext } from '@/lib/analytics/aiContext'
import type { AnalyticsClient } from '@/lib/analytics/types'

export default function AnalyticsClientsPage() {
  const { data, isLoading } = useAnalyticsClients()
  const deleteMutation = useDeleteAnalyticsClient()
  const { toast } = useToast()

  const clients: AnalyticsClient[] = data?.clients ?? []

  const [industryFilter, setIndustryFilter] = useState<string>('All')

  const industries = useMemo(() => {
    const set = new Set<string>()
    for (const c of clients) {
      if (c.industry) set.add(c.industry)
    }
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [clients])

  const filteredClients = useMemo(
    () =>
      industryFilter === 'All'
        ? clients
        : clients.filter((c) => c.industry === industryFilter),
    [clients, industryFilter],
  )

  // Publish a compact snapshot to the floating AI Assistant. Keyed off the
  // stable query result so we don't re-dispatch on every render.
  const aiContext = useMemo<ClientsContext>(
    () => ({
      clients: {
        count: data?.clients?.length ?? 0,
        items: (data?.clients ?? []).slice(0, AI_CONTEXT_MAX_ITEMS).map((c) => ({
          id: c.id,
          name: c.name,
          industry: c.industry,
          contactName: c.contact_name,
          contactEmail: c.contact_email,
          fiscalYearEnd: c.fiscal_year_end,
        })),
      },
    }),
    [data],
  )
  useAIContext(aiContext)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<AnalyticsClient | null>(null)
  const [clientToDelete, setClientToDelete] = useState<AnalyticsClient | null>(null)

  const handleCreate = () => {
    setEditingClient(null)
    setModalOpen(true)
  }

  const handleEdit = (client: AnalyticsClient) => {
    setEditingClient(client)
    setModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!clientToDelete) return
    try {
      await deleteMutation.mutateAsync(clientToDelete.id)
      toast({ title: 'Client deleted', description: `${clientToDelete.name} has been removed.` })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete client.',
        variant: 'destructive',
      })
    } finally {
      setClientToDelete(null)
    }
  }

  const handleExport = (format: ExportFormat) => {
    const dataToExport = filteredClients.length > 0 ? filteredClients : clients
    if (dataToExport.length === 0) {
      toast({ title: 'Nothing to export', description: 'Add a client first.' })
      return
    }
    const rows = dataToExport.map((c) => ({
      'Client Name': c.name,
      Industry: c.industry || '',
      'Contact Name': c.contact_name || '',
      'Contact Email': c.contact_email || '',
      'Contact Phone': c.contact_phone || '',
      'Fiscal Year End': c.fiscal_year_end || '',
      Notes: c.notes || '',
    }))
    exportRows(rows, format, 'Clients_Export', 'Clients').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const columns: ColumnDef<AnalyticsClient>[] = [
    {
      header: 'Client',
      accessorKey: 'name',
      sortable: true,
      cell: (_value, row) => (
        <div className="min-w-0">
          <div className="font-semibold text-foreground">{row.name}</div>
          {row.notes && (
            <div className="line-clamp-1 text-xs text-foreground-muted">{row.notes}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Industry',
      accessorKey: 'industry',
      sortable: true,
      cell: (value) => value || <span className="text-foreground-subtle">—</span>,
    },
    {
      header: 'Contact',
      accessorKey: 'contact_name',
      cell: (_value, row) => {
        const hasContact = row.contact_name || row.contact_email || row.contact_phone
        if (!hasContact) return <span className="text-foreground-subtle">—</span>
        return (
          <div className="space-y-0.5 text-sm">
            {row.contact_name && <div className="text-foreground">{row.contact_name}</div>}
            {row.contact_email && (
              <div className="text-foreground-muted">{row.contact_email}</div>
            )}
            {row.contact_phone && (
              <div className="text-foreground-muted">{row.contact_phone}</div>
            )}
          </div>
        )
      },
    },
    {
      header: 'Fiscal year end',
      accessorKey: 'fiscal_year_end',
      cell: (value) => value || <span className="text-foreground-subtle">—</span>,
    },
  ]

  return (
    <div className="space-y-8">
      <PageHeader
        title="Clients"
        description="Manage the clients your firm works with across analytics."
        actions={
          <Button onClick={handleCreate}>
            <Plus className="mr-1.5 size-4" aria-hidden />
            Add client
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState variant="table" label="Loading clients" />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add your first client to start organizing analyses and projects."
          action={
            <Button onClick={handleCreate}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              Add your first client
            </Button>
          }
        />
      ) : (
        <DataTable
          data={filteredClients}
          columns={columns}
          searchPlaceholder="Search clients…"
          enableSelection
          actions={
            <div className="flex items-center gap-2">
              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger className="h-10 w-44" aria-label="Filter by industry">
                  <SelectValue placeholder="All industries" />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind === 'All' ? 'All industries' : ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ExportButton onExport={handleExport} />
            </div>
          }
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
                onClick={() => setClientToDelete(row)}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        />
      )}

      <ClientModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        client={editingClient}
      />

      <AlertDialog
        open={!!clientToDelete}
        onOpenChange={(open) => !open && setClientToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{clientToDelete?.name}&rdquo;? This also
              removes its projects and analyses, and cannot be undone.
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
                'Delete client'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

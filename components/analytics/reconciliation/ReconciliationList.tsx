'use client'

import { useMemo, useState } from 'react'
import { FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import {
  useCreateAnalyticsReconciliation,
  useDeleteAnalyticsReconciliation,
} from '@/hooks/useAnalyticsReconciliation'
import { useToast } from '@/hooks/use-toast'
import type { AnalyticsClient, AnalyticsReconciliation } from '@/lib/analytics/types'

const ALL_CLIENTS = '__all__'
const NO_CLIENT = '__none__'

interface ReconciliationListProps {
  rows: AnalyticsReconciliation[]
  clients: AnalyticsClient[]
  clientFilter: string | null
  onClientFilterChange: (clientId: string | null) => void
  onReports: () => void
  onOpen: (row: AnalyticsReconciliation) => void
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  in_review: 'outline',
  approved: 'default',
  finalized: 'default',
}

export function ReconciliationList({
  rows,
  clients,
  clientFilter,
  onClientFilterChange,
  onReports,
  onOpen,
}: ReconciliationListProps) {
  const { toast } = useToast()
  const createMutation = useCreateAnalyticsReconciliation()
  const deleteMutation = useDeleteAnalyticsReconciliation()
  const [toDelete, setToDelete] = useState<AnalyticsReconciliation | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClientId, setNewClientId] = useState<string>(NO_CLIENT)

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast({ title: 'Name required', description: 'Give the reconciliation a name.' })
      return
    }
    try {
      const row = await createMutation.mutateAsync({
        name,
        client_id: newClientId === NO_CLIENT ? null : newClientId,
        status: 'draft',
      })
      toast({ title: 'Reconciliation created', description: name })
      setCreateOpen(false)
      setNewName('')
      setNewClientId(NO_CLIENT)
      onOpen(row as AnalyticsReconciliation)
    } catch (error) {
      toast({
        title: 'Create failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await deleteMutation.mutateAsync(toDelete.id)
      toast({ title: 'Reconciliation deleted', description: toDelete.name })
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    } finally {
      setToDelete(null)
    }
  }

  const columns: ColumnDef<AnalyticsReconciliation>[] = [
    {
      header: 'Name',
      accessorKey: 'name',
      sortable: true,
      cell: (_v, row) => <span className="font-semibold text-foreground">{row.name}</span>,
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
      header: 'Source A',
      accessorKey: 'source_a',
      cell: (value) => <span className="tabular-nums">{(value as unknown[] | null)?.length ?? 0}</span>,
    },
    {
      header: 'Source B',
      accessorKey: 'source_b',
      cell: (value) => <span className="tabular-nums">{(value as unknown[] | null)?.length ?? 0}</span>,
    },
    {
      header: 'Matches',
      accessorKey: 'match_groups',
      cell: (value) => <span className="tabular-nums">{(value as unknown[] | null)?.length ?? 0}</span>,
    },
    {
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (value) => {
        const status = (value as string) ?? 'draft'
        return <Badge variant={STATUS_VARIANT[status] ?? 'secondary'}>{status}</Badge>
      },
    },
    {
      header: 'Updated',
      accessorKey: 'updated_at',
      sortable: true,
      cell: (value) => (
        <span className="whitespace-nowrap text-foreground-muted">
          {value ? new Date(value as string).toLocaleDateString() : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <Label htmlFor="recon-client-filter">Client</Label>
          <Select
            value={clientFilter ?? ALL_CLIENTS}
            onValueChange={(v) => onClientFilterChange(v === ALL_CLIENTS ? null : v)}
          >
            <SelectTrigger id="recon-client-filter" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onReports}>
            <FileText className="mr-1.5 size-4" aria-hidden /> Reports
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" aria-hidden /> New reconciliation
          </Button>
        </div>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search reconciliations…"
        onRowClick={onOpen}
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Open ${row.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onOpen(row)
              }}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${row.name}`}
              onClick={(e) => {
                e.stopPropagation()
                setToDelete(row)
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New reconciliation</DialogTitle>
            <DialogDescription>
              Give it a name and optionally link it to a client. You&rsquo;ll upload Source A and
              Source B next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-recon-name">Name</Label>
              <Input
                id="new-recon-name"
                placeholder="e.g. Bank to GL — April"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-recon-client">Client (optional)</Label>
              <Select value={newClientId} onValueChange={setNewClientId}>
                <SelectTrigger id="new-recon-client">
                  <SelectValue placeholder="No client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              )}
              Create &amp; upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reconciliation</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{toDelete?.name}&rdquo;? This permanently removes the sources, rules,
              and match groups.
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
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Deleting…
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

export default ReconciliationList

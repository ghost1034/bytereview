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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import {
  useCreateAnalyticsVariance,
  useDeleteAnalyticsVariance,
} from '@/hooks/useAnalyticsVariance'
import { useToast } from '@/hooks/use-toast'
import type { AnalyticsAnalysis, AnalyticsClient } from '@/lib/analytics/types'
import { defaultVarianceConfig, WORKFLOW_STATUS_VARIANT } from '@/lib/analytics/varianceHelpers'
import {
  readVarianceConfig,
  readVarianceData,
  type VarianceUploadMode,
} from '@/lib/analytics/varianceTypes'

const ALL_CLIENTS = '__all__'
const NO_CLIENT = '__none__'

interface VarianceListProps {
  rows: AnalyticsAnalysis[]
  clients: AnalyticsClient[]
  clientFilter: string | null
  onClientFilterChange: (clientId: string | null) => void
  onReports: () => void
  onOpen: (row: AnalyticsAnalysis) => void
}

export function VarianceList({
  rows,
  clients,
  clientFilter,
  onClientFilterChange,
  onReports,
  onOpen,
}: VarianceListProps) {
  const { toast } = useToast()
  const createMutation = useCreateAnalyticsVariance()
  const deleteMutation = useDeleteAnalyticsVariance()
  const [toDelete, setToDelete] = useState<AnalyticsAnalysis | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClientId, setNewClientId] = useState<string>(NO_CLIENT)
  const [newUploadMode, setNewUploadMode] = useState<VarianceUploadMode>('dual')

  const clientNameById = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients],
  )

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast({ title: 'Name required', description: 'Give the variance analysis a name.' })
      return
    }
    try {
      const config = { ...defaultVarianceConfig(newUploadMode), name }
      const row = await createMutation.mutateAsync({
        type: 'variance',
        name,
        client_id: newClientId === NO_CLIENT ? null : newClientId,
        status: 'Draft',
        config: config as unknown as Record<string, unknown>,
      })
      toast({ title: 'Variance analysis created', description: name })
      setCreateOpen(false)
      setNewName('')
      setNewClientId(NO_CLIENT)
      setNewUploadMode('dual')
      onOpen(row as AnalyticsAnalysis)
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
      toast({ title: 'Variance analysis deleted', description: toDelete.name })
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

  const columns: ColumnDef<AnalyticsAnalysis>[] = [
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
      header: 'Type',
      accessorKey: 'config',
      cell: (_v, row) => {
        const config = readVarianceConfig(row)
        return (
          <span className="text-foreground-muted">
            {config.type ?? '—'}
            {config.uploadMode ? (
              <span className="ml-1 text-foreground-subtle">
                ({config.uploadMode === 'single' ? 'single' : 'dual'})
              </span>
            ) : null}
          </span>
        )
      },
    },
    {
      header: 'Flagged / Total',
      accessorKey: 'data',
      cell: (_v, row) => {
        const data = readVarianceData(row)
        const processed = data.processed ?? []
        if (processed.length === 0) return <span className="text-foreground-subtle">—</span>
        const flagged = processed.filter((p) => p.isFlagged).length
        return (
          <span className="tabular-nums">
            {flagged} / {processed.length}
          </span>
        )
      },
    },
    {
      header: 'Status',
      accessorKey: 'status',
      sortable: true,
      cell: (value) => {
        const status = (value as string) ?? 'Draft'
        return <Badge variant={WORKFLOW_STATUS_VARIANT[status] ?? 'secondary'}>{status}</Badge>
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
          <Label htmlFor="variance-client-filter">Client</Label>
          <Select
            value={clientFilter ?? ALL_CLIENTS}
            onValueChange={(v) => onClientFilterChange(v === ALL_CLIENTS ? null : v)}
          >
            <SelectTrigger id="variance-client-filter" className="w-56">
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
            <Plus className="mr-1.5 size-4" aria-hidden /> New variance analysis
          </Button>
        </div>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        searchPlaceholder="Search analyses…"
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
            <DialogTitle>New variance analysis</DialogTitle>
            <DialogDescription>
              Give it a name and optionally link it to a client. You&rsquo;ll upload your GL data next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-variance-name">Name</Label>
              <Input
                id="new-variance-name"
                placeholder="e.g. Q3 vs Q4 OpEx Flux"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-variance-client">Client (optional)</Label>
              <Select value={newClientId} onValueChange={setNewClientId}>
                <SelectTrigger id="new-variance-client">
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
            <div className="space-y-1.5">
              <Label>Upload mode</Label>
              <RadioGroup
                value={newUploadMode}
                onValueChange={(v) => setNewUploadMode(v as VarianceUploadMode)}
              >
                <div className="flex items-start gap-2 rounded-md border border-border p-3">
                  <RadioGroupItem value="dual" id="upload-dual" className="mt-0.5" />
                  <Label htmlFor="upload-dual" className="cursor-pointer space-y-0.5 font-normal">
                    <div className="font-medium">Dual files (recommended)</div>
                    <div className="text-xs text-foreground-muted">
                      Upload Base Period and Comparison Period as separate files.
                    </div>
                  </Label>
                </div>
                <div className="flex items-start gap-2 rounded-md border border-border p-3">
                  <RadioGroupItem value="single" id="upload-single" className="mt-0.5" />
                  <Label htmlFor="upload-single" className="cursor-pointer space-y-0.5 font-normal">
                    <div className="font-medium">Single file</div>
                    <div className="text-xs text-foreground-muted">
                      One combined file with a period column; you&rsquo;ll specify the date ranges.
                    </div>
                  </Label>
                </div>
              </RadioGroup>
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
            <AlertDialogTitle>Delete variance analysis</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{toDelete?.name}&rdquo;? This permanently removes the uploaded data,
              explanations, and memo.
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

export default VarianceList

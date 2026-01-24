'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient, type JobResultsResponse } from '@/lib/api'
import { Button } from '@/components/ui/button'
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'

type DisplayRow = {
  taskId: string
  rowId: string | null
  rowKey: string
  sourceFiles: string[]
  processingMode: string
  resultSetIndex?: number
  rowSource?: string
  values: Record<string, any>
}

function formatCellValue(value: any): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function EditableResultsTable({
  jobId,
  runId,
  filterTaskId,
  defaultAttachToTaskId = null,
  readOnly = false,
}: {
  jobId: string
  runId?: string
  filterTaskId?: string
  defaultAttachToTaskId?: string | null
  readOnly?: boolean
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const limit = 1000

  const { data, isLoading, error } = useQuery<JobResultsResponse>({
    // Match hooks/useJobs.ts query key so invalidation is consistent
    queryKey: ['job-results', jobId, limit, runId],
    queryFn: () => apiClient.getJobResults(jobId, { runId, limit }),
    enabled: !!jobId,
  })

  const { data: jobDetails } = useQuery<any>({
    queryKey: ['job', jobId, runId],
    queryFn: () => apiClient.getJobDetails(jobId, runId),
    enabled: !!jobId,
    staleTime: 60 * 1000,
  })

  const baseColumnsFromJob = useMemo(() => {
    const fields = jobDetails?.job_fields
    if (!Array.isArray(fields)) return [] as string[]
    return fields
      .slice()
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((f: any) => f.field_name)
      .filter(Boolean)
  }, [jobDetails])

  const displayRows = useMemo(() => {
    const rows: DisplayRow[] = []
    for (const taskResult of data?.results ?? []) {
      if (filterTaskId && taskResult.task_id !== filterTaskId) continue
      const extracted = taskResult.extracted_data || {}
      const cols = Array.isArray(extracted.columns) ? extracted.columns : []
      const results = Array.isArray(extracted.results) ? extracted.results : []
      const rowIds = Array.isArray(extracted.row_ids) ? extracted.row_ids : []
      const rowSources = Array.isArray(extracted.row_sources) ? extracted.row_sources : []

      for (let i = 0; i < results.length; i++) {
        const stableRowId = typeof rowIds[i] === 'string' && rowIds[i] ? rowIds[i] : null
        const arr = Array.isArray(results[i]) ? results[i] : []
        const values: Record<string, any> = {}
        for (let c = 0; c < cols.length; c++) {
          const colName = cols[c]
          values[colName] = c < arr.length ? arr[c] : ''
        }

        rows.push({
          taskId: taskResult.task_id,
          rowId: stableRowId,
          rowKey: stableRowId ?? `${taskResult.task_id}:${i}`,
          sourceFiles: taskResult.source_files ?? [],
          processingMode: taskResult.processing_mode,
          resultSetIndex: (taskResult as any).result_set_index,
          rowSource: rowSources[i],
          values,
        })
      }
    }
    return rows
  }, [data, filterTaskId])

  const unifiedColumns = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = ['Source File Path(s)']
    seen.add('Source File Path(s)')

    for (const col of baseColumnsFromJob) {
      if (!seen.has(col)) {
        seen.add(col)
        ordered.push(col)
      }
    }

    for (const r of data?.results ?? []) {
      if (filterTaskId && r.task_id !== filterTaskId) continue
      const cols = Array.isArray(r.extracted_data?.columns) ? r.extracted_data.columns : []
      for (const col of cols) {
        if (typeof col === 'string' && col && !seen.has(col)) {
          seen.add(col)
          ordered.push(col)
        }
      }
    }

    return ordered
  }, [data, baseColumnsFromJob, filterTaskId])

  const updateCell = useMutation({
    mutationFn: async ({ taskId, rowId, col, value }: { taskId: string; rowId: string; col: string; value: any }) => {
      await apiClient.updateJobResultRow(jobId, taskId, rowId, { [col]: value })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['job-results', jobId] })
    },
    onError: (e: any) => {
      toast({
        title: 'Update failed',
        description: e?.message || 'Failed to update cell',
        variant: 'destructive',
      })
    },
  })

  const deleteRow = useMutation({
    mutationFn: async ({ taskId, rowId }: { taskId: string; rowId: string }) => {
      await apiClient.deleteJobResultRow(jobId, taskId, rowId)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['job-results', jobId] })

      // Deleting the last row of a task may delete that task's files.
      queryClient.invalidateQueries({ queryKey: ['job-files-all', jobId] })
      if (runId) queryClient.invalidateQueries({ queryKey: ['job-files', jobId, runId] })

      // Some file lists (e.g. EnhancedFileUpload) don't use react-query for the
      // file list and won't refresh on invalidateQueries; notify them directly.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cpaautomation:job-files-changed', { detail: { jobId } }))
      }
    },
    onError: (e: any) => {
      toast({
        title: 'Delete failed',
        description: e?.message || 'Failed to delete row',
        variant: 'destructive',
      })
    },
  })

  const createRow = useMutation({
    mutationFn: async ({ attachToTaskId, values }: { attachToTaskId?: string; values: Record<string, any> }) => {
      return apiClient.createJobResultRow(jobId, {
        runId,
        attachToTaskId: attachToTaskId || undefined,
        values,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['job-results', jobId] })
    },
    onError: (e: any) => {
      toast({
        title: 'Add row failed',
        description: e?.message || 'Failed to add row',
        variant: 'destructive',
      })
    },
  })

  const [editing, setEditing] = useState<{ rowId: string; col: string } | null>(null)
  const [draft, setDraft] = useState<string>('')

  const [deleteTarget, setDeleteTarget] = useState<DisplayRow | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const UNATTACHED = '__unattached__'
  const [attachToTaskId, setAttachToTaskId] = useState<string>(UNATTACHED)
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({})

  const manualTaskIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of data?.results ?? []) {
      const isManual =
        r.processing_mode === 'manual' ||
        (Array.isArray(r.source_files) && r.source_files.length === 1 && r.source_files[0] === '(manual)')
      if (isManual) ids.add(r.task_id)
    }
    return ids
  }, [data])

  useEffect(() => {
    if (!addOpen) return
    // If a "manual" task is selected (unattached manual rows), default the dialog to
    // the explicit "Unattached (manual)" option instead of the task.
    const preferred =
      defaultAttachToTaskId && !manualTaskIds.has(defaultAttachToTaskId)
        ? defaultAttachToTaskId
        : UNATTACHED
    setAttachToTaskId(preferred)
  }, [addOpen, defaultAttachToTaskId, manualTaskIds])

  const attachOptions = useMemo(() => {
    const opts: Array<{ id: string; label: string }> = []
    for (const r of data?.results ?? []) {
      if (manualTaskIds.has(r.task_id)) continue
      const label = (r.source_files?.length ? r.source_files.join(', ') : '(manual)')
      opts.push({ id: r.task_id, label })
    }
    // Deduplicate by task_id
    const seen = new Set<string>()
    return opts.filter((o) => {
      if (seen.has(o.id)) return false
      seen.add(o.id)
      return true
    })
  }, [data, manualTaskIds])

  const inputColumns = useMemo(() => {
    const cols = unifiedColumns.filter((c) => c !== 'Source File Path(s)')
    return cols.length ? cols : baseColumnsFromJob
  }, [unifiedColumns, baseColumnsFromJob])

  const startEdit = (rowId: string, col: string, value: any) => {
    setEditing({ rowId, col })
    setDraft(formatCellValue(value))
  }

  const commitEdit = async (row: DisplayRow, col: string) => {
    const next = draft.trim()
    const payload = next === '' ? null : next
    setEditing(null)
    if (!row.rowId) {
      toast({
        title: 'Update failed',
        description: 'Row is missing a stable ID. Refresh and try again.',
        variant: 'destructive',
      })
      return
    }
    await updateCell.mutateAsync({ taskId: row.taskId, rowId: row.rowId, col, value: payload })
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading results…</div>
  }

  if (error) {
    return <div className="p-4 text-sm text-red-600">Error loading results: {(error as any).message}</div>
  }

  const canEdit = !readOnly
  const hasUnkeyedRows = displayRows.some((r) => !r.rowId)

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 p-2">
        <div className="text-sm text-muted-foreground">
          {displayRows.length} rows
        </div>
        <Dialog open={addOpen} onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) {
            setAttachToTaskId(UNATTACHED)
            setNewRowValues({})
          }
        }}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={!canEdit || createRow.isPending}>
              Add row
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add manual row</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Attach to</Label>
                <Select value={attachToTaskId} onValueChange={setAttachToTaskId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unattached (manual)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNATTACHED}>Unattached (manual)</SelectItem>
                    {attachOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="h-[50vh] pr-4">
                <div className="space-y-3">
                  {inputColumns.map((col) => (
                    <div key={col} className="grid grid-cols-3 items-center gap-3">
                      <Label className="text-sm text-muted-foreground">{col}</Label>
                      <div className="col-span-2">
                        <Input
                          value={newRowValues[col] ?? ''}
                          onChange={(e) => setNewRowValues((prev) => ({ ...prev, [col]: e.target.value }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <ScrollBar orientation="vertical" />
              </ScrollArea>
            </div>

            <DialogFooter>
              <Button
                disabled={createRow.isPending}
                onClick={async () => {
                  const values: Record<string, any> = {}
                  for (const col of inputColumns) {
                    const v = (newRowValues[col] ?? '').trim()
                    if (v !== '') values[col] = v
                  }
                  await createRow.mutateAsync({
                    attachToTaskId: attachToTaskId === UNATTACHED ? undefined : attachToTaskId,
                    values,
                  })
                  setAddOpen(false)
                }}
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {hasUnkeyedRows && (
        <div className="px-2 pb-2 text-xs text-muted-foreground">
          Some rows are missing stable IDs, so editing is temporarily disabled for them. Refresh if this persists.
        </div>
      )}

      <ScrollArea className="flex-1 w-full">
        <div className="min-w-max">
          <Table>
            <TableHeader>
              <TableRow>
                {unifiedColumns.map((col) => (
                  <TableHead key={col} className="whitespace-nowrap bg-gray-50 font-semibold">
                    {col}
                  </TableHead>
                ))}
                <TableHead className="whitespace-nowrap bg-gray-50 font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={unifiedColumns.length + 1} className="text-sm text-muted-foreground">
                    No results yet.
                  </TableCell>
                </TableRow>
              ) : (
                displayRows.map((row) => (
                  <TableRow key={`${row.taskId}:${row.rowKey}`}>
                    <TableCell className="whitespace-nowrap">
                      {(row.sourceFiles?.length ? row.sourceFiles.join(', ') : '(manual)')}
                    </TableCell>
                    {unifiedColumns
                      .filter((c) => c !== 'Source File Path(s)')
                      .map((col) => {
                        const isEditing = editing?.rowId === row.rowId && editing?.col === col
                        const value = row.values[col]
                         return (
                            <TableCell
                              key={`${row.rowKey}:${col}`}
                              className={canEdit ? 'whitespace-nowrap cursor-text' : 'whitespace-nowrap'}
                              onDoubleClick={() => {
                              if (!canEdit || !row.rowId) return
                              startEdit(row.rowId, col, value)
                              }}
                            >
                            {isEditing ? (
                              <Input
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={() => commitEdit(row, col)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    commitEdit(row, col)
                                  }
                                  if (e.key === 'Escape') {
                                    setEditing(null)
                                  }
                                }}
                              />
                            ) : (
                              <span className={row.rowSource === 'manual' ? 'text-foreground' : 'text-foreground'}>
                                {formatCellValue(value)}
                              </span>
                            )}
                          </TableCell>
                        )
                      })}
                    <TableCell className="whitespace-nowrap">
                  <Button
                        variant="outline"
                        size="sm"
                        disabled={!canEdit || deleteRow.isPending || !row.rowId}
                        onClick={() => setDeleteTarget(row)}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete row?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this extracted row. If this is the last row for its task, the source file(s) for that task may also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                const t = deleteTarget
                setDeleteTarget(null)
                if (!t?.rowId) return
                deleteRow.mutate({ taskId: t.taskId, rowId: t.rowId })
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

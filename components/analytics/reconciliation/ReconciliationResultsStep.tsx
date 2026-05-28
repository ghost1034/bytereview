'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileText,
  Layers,
  Link2,
  Loader2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { useManualMatchReconciliation, useUpdateReconciliationException } from '@/hooks/useAnalyticsReconciliation'
import { useToast } from '@/hooks/use-toast'
import { exportRows, exportRowsMultiSheet } from '@/lib/analytics/exportData'
import { formatCurrency } from '@/lib/analytics/format'
import type {
  ExceptionStatus,
  ReconciliationMatchGroup,
  ReconciliationTransaction,
} from '@/lib/analytics/reconciliationTypes'
import { MatchGroupCard } from './MatchGroupCard'

interface ReconciliationResultsStepProps {
  reconciliationId: string
  reconciliationName: string
  sourceA: ReconciliationTransaction[]
  sourceB: ReconciliationTransaction[]
  matchGroups: ReconciliationMatchGroup[]
  locked?: boolean
}

const EXCEPTION_STATUSES: { value: ExceptionStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'waived', label: 'Waived' },
]

const EXCEPTION_PALETTE = [
  'bg-amber-500',
  'bg-purple-500',
  'bg-red-500',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-orange-500',
]

export function ReconciliationResultsStep({
  reconciliationId,
  reconciliationName,
  sourceA,
  sourceB,
  matchGroups,
  locked = false,
}: ReconciliationResultsStepProps) {
  const { toast } = useToast()
  const manualMatchMutation = useManualMatchReconciliation()
  const [selectedA, setSelectedA] = useState<(string | number)[]>([])
  const [selectedB, setSelectedB] = useState<(string | number)[]>([])

  const matchedA = useMemo(() => sourceA.filter((t) => t.status === 'matched'), [sourceA])
  const matchedB = useMemo(() => sourceB.filter((t) => t.status === 'matched'), [sourceB])
  const unmatchedA = useMemo(
    () => sourceA.filter((t) => t.status === 'unmatched'),
    [sourceA],
  )
  const unmatchedB = useMemo(
    () => sourceB.filter((t) => t.status === 'unmatched'),
    [sourceB],
  )
  const exceptions = useMemo(
    () => [
      ...unmatchedA.filter((t) => t.exceptionCategory),
      ...unmatchedB.filter((t) => t.exceptionCategory),
    ],
    [unmatchedA, unmatchedB],
  )

  // ----- KPIs --------------------------------------------------------------
  const approvedGroups = useMemo(
    () => matchGroups.filter((g) => g.status === 'approved'),
    [matchGroups],
  )
  const totalCount = sourceA.length + sourceB.length
  const matchedCount = matchedA.length + matchedB.length
  const matchRatePct =
    totalCount === 0 ? 0 : Math.round((matchedCount / totalCount) * 100)
  const totalMatched = approvedGroups.reduce((sum, g) => sum + Math.abs(g.totalA), 0)
  const remainingDifference = Math.abs(
    unmatchedA.reduce((s, t) => s + t.amount, 0) -
      unmatchedB.reduce((s, t) => s + t.amount, 0),
  )

  // Exception classification breakdown
  const exceptionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of [...unmatchedA, ...unmatchedB]) {
      const cat = t.exceptionCategory || 'UNCLASSIFIED'
      counts[cat] = (counts[cat] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [unmatchedA, unmatchedB])
  const exceptionTotal = exceptionCounts.reduce((s, [, c]) => s + c, 0)

  // ----- Row builders for reports ------------------------------------------
  const matchedRows = useMemo(
    () =>
      matchGroups.map((g) => ({
        ID: g.id,
        Type: g.type,
        Status: g.status,
        Confidence: g.confidence,
        'Total A': g.totalA,
        'Total B': g.totalB,
        Variance: Math.abs(Math.abs(g.totalA) - Math.abs(g.totalB)),
        'Source A IDs': (g.sourceAIds ?? []).join(', '),
        'Source B IDs': (g.sourceBIds ?? []).join(', '),
        Explanation: g.explanation,
      })),
    [matchGroups],
  )
  const unmatchedRows = useMemo(
    () =>
      [...unmatchedA, ...unmatchedB].map((t) => ({
        Source: t.source,
        ID: t.id,
        Date: t.date,
        Description: t.description,
        Amount: t.amount,
        'Exception Category': t.exceptionCategory ?? '',
      })),
    [unmatchedA, unmatchedB],
  )
  const exceptionRows = useMemo(
    () =>
      exceptions.map((t) => ({
        Source: t.source,
        ID: t.id,
        Date: t.date,
        Description: t.description,
        Amount: t.amount,
        Category: t.exceptionCategory ?? '',
        Status: t.exceptionStatus ?? 'open',
        Note: t.exceptionNote ?? '',
        Reasoning: t.exceptionReasoning ?? '',
      })),
    [exceptions],
  )
  const summaryRows = useMemo(
    () => [
      { Metric: 'Total Source A rows', Value: sourceA.length },
      { Metric: 'Total Source B rows', Value: sourceB.length },
      { Metric: 'Match rate', Value: `${matchRatePct}%` },
      { Metric: 'Total matched (Source A)', Value: totalMatched },
      { Metric: 'Remaining difference', Value: remainingDifference },
      { Metric: 'Match groups', Value: matchGroups.length },
      { Metric: 'Approved groups', Value: approvedGroups.length },
      { Metric: 'Unmatched Source A', Value: unmatchedA.length },
      { Metric: 'Unmatched Source B', Value: unmatchedB.length },
      { Metric: 'Exceptions', Value: exceptions.length },
    ],
    [
      sourceA.length,
      sourceB.length,
      matchRatePct,
      totalMatched,
      remainingDifference,
      matchGroups.length,
      approvedGroups.length,
      unmatchedA.length,
      unmatchedB.length,
      exceptions.length,
    ],
  )

  const fileBase = reconciliationName.replace(/[^A-Za-z0-9]+/g, '_')

  const downloadReport = async (
    report: 'full' | 'matched' | 'unmatched' | 'exceptions' | 'summary',
    format: ExportFormat,
  ) => {
    try {
      if (report === 'full') {
        await exportRowsMultiSheet(
          [
            { sheetName: 'Summary', rows: summaryRows },
            { sheetName: 'Matched', rows: matchedRows },
            { sheetName: 'Unmatched', rows: unmatchedRows },
            { sheetName: 'Exceptions', rows: exceptionRows },
          ],
          format,
          `${fileBase}_full_reconciliation`,
        )
        return
      }
      const rows =
        report === 'matched'
          ? matchedRows
          : report === 'unmatched'
            ? unmatchedRows
            : report === 'exceptions'
              ? exceptionRows
              : summaryRows
      await exportRows(rows, format, `${fileBase}_${report}`, report)
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' })
    }
  }

  const handleManualMatch = async () => {
    if (selectedA.length === 0 || selectedB.length === 0) {
      toast({
        title: 'Select from both sources',
        description: 'Pick at least one row in each pane to create a manual match.',
      })
      return
    }
    try {
      await manualMatchMutation.mutateAsync({
        reconciliationId,
        data: {
          sourceAIds: selectedA.map(String),
          sourceBIds: selectedB.map(String),
          explanation: 'Manually matched by user',
        },
      })
      toast({ title: 'Manual match created' })
      setSelectedA([])
      setSelectedB([])
    } catch (error) {
      toast({
        title: 'Manual match failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const txnColumns: ColumnDef<ReconciliationTransaction>[] = [
    { header: 'Date', accessorKey: 'date', sortable: true },
    { header: 'Description', accessorKey: 'description', sortable: true },
    {
      header: 'Amount',
      accessorKey: 'amount',
      sortable: true,
      cell: (v) => <span className="tabular-nums">{formatCurrency(v as number)}</span>,
    },
    {
      header: 'Exception',
      accessorKey: 'exceptionCategory',
      cell: (v) =>
        v ? (
          <Badge variant="outline">{String(v)}</Badge>
        ) : (
          <span className="text-foreground-subtle">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">
            <BarChart3 className="mr-1 size-3.5" aria-hidden /> Summary
          </TabsTrigger>
          <TabsTrigger value="matched">
            <Layers className="mr-1 size-3.5" aria-hidden /> Matched ({matchGroups.length})
          </TabsTrigger>
          <TabsTrigger value="unmatched">
            Unmatched ({unmatchedA.length + unmatchedB.length})
          </TabsTrigger>
          <TabsTrigger value="exceptions">
            <AlertTriangle className="mr-1 size-3.5" aria-hidden /> Exceptions ({exceptions.length})
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText className="mr-1 size-3.5" aria-hidden /> Reports
          </TabsTrigger>
        </TabsList>

        {/* ---------- Summary tab ------------------------------------------- */}
        <TabsContent value="summary" className="mt-4 space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Match rate"
              value={`${matchRatePct}%`}
              hint={`${matchedCount} of ${totalCount} rows matched`}
            />
            <StatCard
              label="Total matched"
              value={formatCurrency(totalMatched)}
              hint={`${approvedGroups.length} approved group${approvedGroups.length === 1 ? '' : 's'}`}
            />
            <StatCard
              label="Remaining difference"
              value={formatCurrency(remainingDifference)}
              hint="A unmatched − B unmatched"
            />
            <StatCard
              label="Unmatched items"
              value={unmatchedA.length + unmatchedB.length}
              hint={`A: ${unmatchedA.length} · B: ${unmatchedB.length}`}
            />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">
              Exception classification breakdown
            </h3>
            {exceptionCounts.length === 0 ? (
              <p className="mt-3 text-sm text-foreground-muted">
                No exceptions yet — every row matched, or matching hasn&rsquo;t run.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {exceptionCounts.map(([cat, count], idx) => {
                  const pct = exceptionTotal === 0 ? 0 : (count / exceptionTotal) * 100
                  return (
                    <li key={cat} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`size-2.5 rounded-full ${EXCEPTION_PALETTE[idx % EXCEPTION_PALETTE.length]}`}
                            aria-hidden
                          />
                          {cat}
                        </span>
                        <span className="tabular-nums text-foreground-muted">
                          {count} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={`h-full ${EXCEPTION_PALETTE[idx % EXCEPTION_PALETTE.length]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        {/* ---------- Matched tab ------------------------------------------- */}
        <TabsContent value="matched" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <ExportButton onExport={(f) => downloadReport('matched', f)} label="Export matched" />
          </div>
          {matchGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-foreground-muted">
              No match groups yet.
            </div>
          ) : (
            matchGroups.map((g) => (
              <MatchGroupCard
                key={g.id}
                reconciliationId={reconciliationId}
                group={g}
                sourceA={sourceA}
                sourceB={sourceB}
                locked={locked}
              />
            ))
          )}
        </TabsContent>

        {/* ---------- Unmatched (dual-pane manual match) -------------------- */}
        <TabsContent value="unmatched" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-foreground-muted">
              Select rows on both sides, then click <strong>Manual match selected</strong> to
              create an approved match group.
            </p>
            <Button
              onClick={handleManualMatch}
              disabled={
                locked ||
                manualMatchMutation.isPending ||
                selectedA.length === 0 ||
                selectedB.length === 0
              }
            >
              {manualMatchMutation.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="mr-1.5 size-4" aria-hidden />
              )}
              Manual match selected
              {selectedA.length + selectedB.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedA.length} / {selectedB.length}
                </Badge>
              )}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Source A unmatched ({unmatchedA.length})
                </h3>
                <ExportButton
                  onExport={(f) =>
                    exportRows(
                      unmatchedA.map((t) => ({
                        ID: t.id,
                        Date: t.date,
                        Description: t.description,
                        Amount: t.amount,
                        Category: t.exceptionCategory ?? '',
                      })),
                      f,
                      `${fileBase}_unmatched_A`,
                      'Unmatched A',
                    )
                  }
                  label="Export"
                />
              </div>
              <DataTable
                data={unmatchedA}
                columns={txnColumns}
                enableSelection
                selectedRows={selectedA}
                onSelectionChange={setSelectedA}
                searchPlaceholder="Search Source A…"
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  Source B unmatched ({unmatchedB.length})
                </h3>
                <ExportButton
                  onExport={(f) =>
                    exportRows(
                      unmatchedB.map((t) => ({
                        ID: t.id,
                        Date: t.date,
                        Description: t.description,
                        Amount: t.amount,
                        Category: t.exceptionCategory ?? '',
                      })),
                      f,
                      `${fileBase}_unmatched_B`,
                      'Unmatched B',
                    )
                  }
                  label="Export"
                />
              </div>
              <DataTable
                data={unmatchedB}
                columns={txnColumns}
                enableSelection
                selectedRows={selectedB}
                onSelectionChange={setSelectedB}
                searchPlaceholder="Search Source B…"
              />
            </div>
          </div>
        </TabsContent>

        {/* ---------- Exceptions (cards) ----------------------------------- */}
        <TabsContent value="exceptions" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <ExportButton
              onExport={(f) => downloadReport('exceptions', f)}
              label="Export exceptions"
            />
          </div>
          {exceptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-foreground-muted">
              No exceptions raised. Either everything matched, or the matcher hasn&rsquo;t
              classified any unmatched items yet.
            </div>
          ) : (
            exceptions.map((t) => (
              <ExceptionCard
                key={`${t.source}-${t.id}`}
                reconciliationId={reconciliationId}
                txn={t}
                locked={locked}
              />
            ))
          )}
        </TabsContent>

        {/* ---------- Reports tab ------------------------------------------ */}
        <TabsContent value="reports" className="mt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ReportCard
              title="Full reconciliation"
              description="Multi-sheet workbook: Summary, Matched, Unmatched, Exceptions."
              onExport={(f) => downloadReport('full', f)}
            />
            <ReportCard
              title="Matched detail"
              description="Every match group with type, confidence, totals, variance, and IDs."
              onExport={(f) => downloadReport('matched', f)}
            />
            <ReportCard
              title="Unmatched items"
              description="Unmatched rows from both Source A and Source B."
              onExport={(f) => downloadReport('unmatched', f)}
            />
            <ReportCard
              title="Exception report"
              description="Classified exceptions with reasoning, status, and notes."
              onExport={(f) => downloadReport('exceptions', f)}
            />
            <ReportCard
              title="Reconciliation summary"
              description="KPIs: match rate, total matched, remaining difference, counts."
              onExport={(f) => downloadReport('summary', f)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ReportCard({
  title,
  description,
  onExport,
}: {
  title: string
  description: string
  onExport: (format: ExportFormat) => void
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-1 text-xs text-foreground-muted">{description}</p>
      </div>
      <div className="flex justify-end">
        <ExportButton onExport={onExport} label="Export" />
      </div>
    </div>
  )
}

function ExceptionCard({
  reconciliationId,
  txn,
  locked,
}: {
  reconciliationId: string
  txn: ReconciliationTransaction
  locked: boolean
}) {
  const { toast } = useToast()
  const updateMutation = useUpdateReconciliationException()
  const [noteDraft, setNoteDraft] = useState(txn.exceptionNote ?? '')

  const handleStatus = async (next: ExceptionStatus) => {
    try {
      await updateMutation.mutateAsync({
        reconciliationId,
        txnId: txn.id,
        data: { source: txn.source, exceptionStatus: next },
      })
    } catch (error) {
      toast({
        title: 'Status update failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const handleNoteSave = async () => {
    if (noteDraft === (txn.exceptionNote ?? '')) return
    try {
      await updateMutation.mutateAsync({
        reconciliationId,
        txnId: txn.id,
        data: { source: txn.source, exceptionNote: noteDraft },
      })
      toast({ title: 'Note saved' })
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const status = (txn.exceptionStatus ?? 'open') as ExceptionStatus
  const statusVariant: Record<ExceptionStatus, 'default' | 'secondary' | 'outline'> = {
    open: 'secondary',
    investigating: 'outline',
    resolved: 'default',
    waived: 'outline',
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Source {txn.source}</Badge>
          {txn.exceptionCategory && (
            <Badge variant="secondary">{txn.exceptionCategory}</Badge>
          )}
          <Badge variant={statusVariant[status]}>
            {status === 'resolved' && <CheckCircle2 className="mr-1 size-3" aria-hidden />}
            {EXCEPTION_STATUSES.find((s) => s.value === status)?.label ?? status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground-muted tabular-nums">
            {txn.date} · {formatCurrency(txn.amount)}
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm text-foreground">{txn.description}</p>
      {txn.exceptionReasoning && (
        <p className="mt-1 text-xs text-foreground-muted">{txn.exceptionReasoning}</p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem,1fr]">
        <div>
          <Label className="text-xs">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => handleStatus(v as ExceptionStatus)}
            disabled={locked || updateMutation.isPending}
          >
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXCEPTION_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Note</Label>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={handleNoteSave}
            disabled={locked || updateMutation.isPending}
            rows={2}
            className="mt-1 text-xs"
            placeholder="Add investigation notes…"
          />
        </div>
      </div>
    </div>
  )
}

export default ReconciliationResultsStep

'use client'

import { useMemo, useState } from 'react'
import { Layers, Link2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable, type ColumnDef } from '@/components/analytics/DataTable'
import { ExportButton, type ExportFormat } from '@/components/analytics/ExportButton'
import { useToast } from '@/hooks/use-toast'
import { exportRows } from '@/lib/analytics/exportData'
import { formatCurrency } from '@/lib/analytics/format'
import type {
  ReconciliationMatchGroup,
  ReconciliationTransaction,
} from '@/lib/analytics/reconciliationTypes'
import { MatchGroupCard } from './MatchGroupCard'
import { ManualMatchDialog } from './ManualMatchDialog'

interface ReconciliationResultsStepProps {
  reconciliationId: string
  reconciliationName: string
  sourceA: ReconciliationTransaction[]
  sourceB: ReconciliationTransaction[]
  matchGroups: ReconciliationMatchGroup[]
}

export function ReconciliationResultsStep({
  reconciliationId,
  reconciliationName,
  sourceA,
  sourceB,
  matchGroups,
}: ReconciliationResultsStepProps) {
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)

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
  const approvedCount = matchGroups.filter((g) => g.status === 'approved').length

  const handleExport = (format: ExportFormat, scope: 'matched' | 'unmatchedA' | 'unmatchedB' | 'exceptions' | 'full') => {
    const fileBase = `${reconciliationName.replace(/[^A-Za-z0-9]+/g, '_')}_${scope}`
    if (scope === 'matched') {
      const rows = matchGroups.map((g) => ({
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
      }))
      exportRows(rows, format, fileBase, 'Matched groups').catch(() =>
        toast({ title: 'Export failed', variant: 'destructive' }),
      )
      return
    }
    if (scope === 'unmatchedA' || scope === 'unmatchedB') {
      const rows = (scope === 'unmatchedA' ? unmatchedA : unmatchedB).map((t) => ({
        ID: t.id,
        Date: t.date,
        Description: t.description,
        Amount: t.amount,
        Status: t.status,
        'Exception Category': t.exceptionCategory ?? '',
        'Exception Reasoning': t.exceptionReasoning ?? '',
      }))
      exportRows(rows, format, fileBase, `Unmatched ${scope === 'unmatchedA' ? 'A' : 'B'}`).catch(() =>
        toast({ title: 'Export failed', variant: 'destructive' }),
      )
      return
    }
    if (scope === 'exceptions') {
      const rows = exceptions.map((t) => ({
        Source: t.source,
        ID: t.id,
        Date: t.date,
        Description: t.description,
        Amount: t.amount,
        Category: t.exceptionCategory ?? '',
        Reasoning: t.exceptionReasoning ?? '',
      }))
      exportRows(rows, format, fileBase, 'Exceptions').catch(() =>
        toast({ title: 'Export failed', variant: 'destructive' }),
      )
      return
    }
    // full — flatten everything to a single sheet
    const rows = [
      ...matchGroups.map((g) => ({
        Section: 'Matched',
        ID: g.id,
        Type: g.type,
        Status: g.status,
        'Source A IDs': (g.sourceAIds ?? []).join(', '),
        'Source B IDs': (g.sourceBIds ?? []).join(', '),
        'Total A': g.totalA,
        'Total B': g.totalB,
        Confidence: g.confidence,
        Description: g.explanation,
        Amount: null,
        Date: null,
      })),
      ...unmatchedA.map((t) => ({
        Section: 'Unmatched A',
        ID: t.id,
        Type: '',
        Status: t.status,
        'Source A IDs': '',
        'Source B IDs': '',
        'Total A': null,
        'Total B': null,
        Confidence: null,
        Description: t.description,
        Amount: t.amount,
        Date: t.date,
      })),
      ...unmatchedB.map((t) => ({
        Section: 'Unmatched B',
        ID: t.id,
        Type: '',
        Status: t.status,
        'Source A IDs': '',
        'Source B IDs': '',
        'Total A': null,
        'Total B': null,
        Confidence: null,
        Description: t.description,
        Amount: t.amount,
        Date: t.date,
      })),
    ]
    exportRows(rows, format, fileBase, 'Reconciliation').catch(() =>
      toast({ title: 'Export failed', variant: 'destructive' }),
    )
  }

  const txnColumns: ColumnDef<ReconciliationTransaction>[] = [
    {
      header: 'Date',
      accessorKey: 'date',
      sortable: true,
    },
    {
      header: 'Description',
      accessorKey: 'description',
      sortable: true,
    },
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Match groups" value={matchGroups.length} hint={`${approvedCount} approved`} />
        <StatCard label="Source A rows" value={sourceA.length} hint={`${unmatchedA.length} unmatched`} />
        <StatCard label="Source B rows" value={sourceB.length} hint={`${unmatchedB.length} unmatched`} />
        <StatCard label="Exceptions" value={exceptions.length} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={() => setDialogOpen(true)} variant="outline">
          <Link2 className="mr-1.5 size-4" aria-hidden /> Manual match
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton onExport={(f) => handleExport(f, 'full')} label="Export full" />
        </div>
      </div>

      <Tabs defaultValue="matched">
        <TabsList>
          <TabsTrigger value="matched">
            <Layers className="mr-1 size-3.5" aria-hidden /> Matched ({matchGroups.length})
          </TabsTrigger>
          <TabsTrigger value="unmatched-a">Unmatched A ({unmatchedA.length})</TabsTrigger>
          <TabsTrigger value="unmatched-b">Unmatched B ({unmatchedB.length})</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions ({exceptions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="matched" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <ExportButton onExport={(f) => handleExport(f, 'matched')} label="Export matched" />
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
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="unmatched-a" className="mt-4">
          <DataTable
            data={unmatchedA}
            columns={txnColumns}
            searchPlaceholder="Search unmatched A…"
            actions={<ExportButton onExport={(f) => handleExport(f, 'unmatchedA')} label="Export" />}
          />
        </TabsContent>

        <TabsContent value="unmatched-b" className="mt-4">
          <DataTable
            data={unmatchedB}
            columns={txnColumns}
            searchPlaceholder="Search unmatched B…"
            actions={<ExportButton onExport={(f) => handleExport(f, 'unmatchedB')} label="Export" />}
          />
        </TabsContent>

        <TabsContent value="exceptions" className="mt-4">
          <DataTable
            data={exceptions}
            columns={[
              { header: 'Source', accessorKey: 'source' },
              ...txnColumns,
            ]}
            searchPlaceholder="Search exceptions…"
            actions={<ExportButton onExport={(f) => handleExport(f, 'exceptions')} label="Export" />}
          />
        </TabsContent>
      </Tabs>

      <ManualMatchDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        reconciliationId={reconciliationId}
        unmatchedA={unmatchedA}
        unmatchedB={unmatchedB}
      />
    </div>
  )
}

export default ReconciliationResultsStep

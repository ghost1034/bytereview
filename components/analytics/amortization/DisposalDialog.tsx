'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

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
import { useToast } from '@/hooks/use-toast'
import {
  useCreateAnalyticsJournalEntry,
  useUpdateAnalyticsAmortization,
} from '@/hooks/useAnalyticsAmortization'
import {
  buildDisposalJournalLines,
  prorateDisposal,
} from '@/lib/analytics/amortizationHelpers'
import { DEFAULT_ACCOUNTS, type ScheduleRow } from '@/lib/analytics/amortizationTypes'
import { formatCurrency } from '@/lib/analytics/format'
import type { AnalyticsAmortization } from '@/lib/analytics/types'

interface DisposalDialogProps {
  asset: AnalyticsAmortization | null
  onClose: () => void
}

/**
 * Record a disposal: clip the schedule at the disposal date, compute gain/loss
 * vs sale proceeds, mark the asset as Disposed, and append a disposal JE.
 */
export function DisposalDialog({ asset, onClose }: DisposalDialogProps) {
  const { toast } = useToast()
  const updateMutation = useUpdateAnalyticsAmortization()
  const createJeMutation = useCreateAnalyticsJournalEntry()

  const today = new Date().toISOString().split('T')[0]
  const [disposalDate, setDisposalDate] = useState(today)
  const [saleProceeds, setSaleProceeds] = useState<number>(0)
  const [gainLossAccount, setGainLossAccount] = useState<string>(DEFAULT_ACCOUNTS.gainLossAccount)
  const [clearingAccount, setClearingAccount] = useState<string>(DEFAULT_ACCOUNTS.clearingAccount)
  const [assetAccount, setAssetAccount] = useState<string>(DEFAULT_ACCOUNTS.assetAccount)

  useEffect(() => {
    if (asset) {
      setDisposalDate(today)
      setSaleProceeds(0)
      setGainLossAccount(DEFAULT_ACCOUNTS.gainLossAccount)
      setClearingAccount(DEFAULT_ACCOUNTS.clearingAccount)
      setAssetAccount(DEFAULT_ACCOUNTS.assetAccount)
    }
    // disposalDate default deliberately recomputed when a new asset opens.
  }, [asset, today])

  const schedule = useMemo<ScheduleRow[]>(
    () => (asset?.schedule ?? []) as unknown as ScheduleRow[],
    [asset],
  )
  const taxSchedule = useMemo<ScheduleRow[]>(
    () => (asset?.tax_schedule ?? []) as unknown as ScheduleRow[],
    [asset],
  )

  const cost = asset?.cost_basis ?? 0
  const preview = useMemo(
    () => prorateDisposal(schedule, disposalDate, saleProceeds || 0, cost),
    [schedule, disposalDate, saleProceeds, cost],
  )
  const taxPreview = useMemo(
    () =>
      taxSchedule.length > 0
        ? prorateDisposal(taxSchedule, disposalDate, saleProceeds || 0, cost)
        : null,
    [taxSchedule, disposalDate, saleProceeds, cost],
  )

  const handleSubmit = async () => {
    if (!asset) return
    try {
      const existing = (asset.type_specific ?? {}) as Record<string, unknown>
      const typeSpecific = {
        ...existing,
        disposalDate,
        saleProceeds,
        gainLossAccount,
        clearingAccount,
        assetAccount,
        nbvAtDisposal: preview.nbvAtDisposal,
        gaapGainLoss: preview.gainLoss,
        disposalAccumDepr: preview.accumAtDisposal,
        ...(taxPreview
          ? {
              taxNbvAtDisposal: taxPreview.nbvAtDisposal,
              taxGainLoss: taxPreview.gainLoss,
              taxDisposalAccumDepr: taxPreview.accumAtDisposal,
            }
          : {}),
      }
      await updateMutation.mutateAsync({
        amortizationId: asset.id,
        data: {
          status: 'Disposed',
          schedule: preview.truncatedSchedule,
          ...(taxPreview ? { tax_schedule: taxPreview.truncatedSchedule } : {}),
          type_specific: typeSpecific,
        },
      })

      const jeLines = buildDisposalJournalLines({
        assetName: asset.asset_name,
        date: disposalDate,
        cost,
        accumDepr: preview.accumAtDisposal,
        saleProceeds: saleProceeds || 0,
        gainLoss: preview.gainLoss,
        clearingAccount,
        accumulatedAccount: DEFAULT_ACCOUNTS.accumulatedAccount,
        assetAccount,
        gainLossAccount,
      })
      await createJeMutation.mutateAsync({
        amortization_id: asset.id,
        client_id: asset.client_id ?? null,
        period: disposalDate.slice(0, 7),
        entries: jeLines.map((l) => ({
          account: l.account,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo,
        })),
      })

      const isGain = preview.gainLoss >= 0
      toast({
        title: 'Asset disposed',
        description: `${asset.asset_name} marked disposed; ${
          isGain ? 'gain' : 'loss'
        } of ${formatCurrency(Math.abs(preview.gainLoss))} recorded.`,
      })
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to record disposal.',
        variant: 'destructive',
      })
    }
  }

  const isPending = updateMutation.isPending || createJeMutation.isPending

  return (
    <Dialog open={!!asset} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dispose asset</DialogTitle>
          <DialogDescription>
            Clip the schedule at the disposal date, record gain/loss vs sale proceeds, and post a
            disposal journal entry for &ldquo;{asset?.asset_name}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dispose-date">Disposal date</Label>
              <Input
                id="dispose-date"
                type="date"
                value={disposalDate}
                onChange={(e) => setDisposalDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispose-proceeds">Sale proceeds</Label>
              <Input
                id="dispose-proceeds"
                type="number"
                value={Number.isNaN(saleProceeds) ? '' : saleProceeds}
                onChange={(e) => setSaleProceeds(parseFloat(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dispose-gl">Gain / loss account</Label>
            <Input
              id="dispose-gl"
              value={gainLossAccount}
              onChange={(e) => setGainLossAccount(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dispose-clearing">Clearing account</Label>
              <Input
                id="dispose-clearing"
                value={clearingAccount}
                onChange={(e) => setClearingAccount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dispose-asset">Asset account</Label>
              <Input
                id="dispose-asset"
                value={assetAccount}
                onChange={(e) => setAssetAccount(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-foreground-muted">NBV at disposal</span>
              <span className="tabular-nums font-medium text-foreground">
                {formatCurrency(preview.nbvAtDisposal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground-muted">
                {preview.gainLoss >= 0 ? 'Gain' : 'Loss'} on disposal
              </span>
              <span
                className={`tabular-nums font-semibold ${
                  preview.gainLoss >= 0 ? 'text-success' : 'text-destructive'
                }`}
              >
                {formatCurrency(preview.gainLoss)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Record disposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DisposalDialog

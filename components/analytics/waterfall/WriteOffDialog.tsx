'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { useUpdateAnalyticsWaterfall } from '@/hooks/useAnalyticsWaterfall'
import { currentMonthKey } from '@/lib/analytics/format'
import type { SavedWaterfall } from '@/lib/analytics/waterfallData'
import { applyWriteOff } from '@/lib/analytics/waterfallEngine'

interface WriteOffDialogProps {
  waterfall: SavedWaterfall | null
  onClose: () => void
}

/**
 * Recognize the entire remaining balance in a single chosen month, then persist
 * the truncated schedule + appended write-off journal entry.
 */
export function WriteOffDialog({ waterfall, onClose }: WriteOffDialogProps) {
  const { toast } = useToast()
  const updateMutation = useUpdateAnalyticsWaterfall()
  const [asOf, setAsOf] = useState(currentMonthKey())

  useEffect(() => {
    if (waterfall) setAsOf(currentMonthKey())
  }, [waterfall])

  const handleWriteOff = async () => {
    if (!waterfall) return
    const { form, schedule, journalEntries } = waterfall
    const result = applyWriteOff(
      {
        subtype: form.type,
        totalAmount: form.totalAmount,
        partyName: form.partyName,
        name: form.name,
        accounts: {
          deferredAccount: form.deferredAccount,
          revenueAccount: form.revenueAccount,
          prepaidAccount: form.prepaidAccount,
          expenseAccount: form.expenseAccount,
          liabilityAccount: form.liabilityAccount,
          defCommAccount: form.defCommAccount,
          commExpenseAccount: form.commExpenseAccount,
        },
        schedule,
        journalEntries,
      },
      asOf,
    )

    if (result.journalEntries.length === journalEntries.length) {
      toast({
        title: 'Nothing to write off',
        description: 'The balance is already fully recognized by that month.',
      })
      return
    }

    try {
      await updateMutation.mutateAsync({
        analysisId: waterfall.id,
        data: { data: result.schedule, results: result.journalEntries },
      })
      toast({ title: 'Balance written off', description: `${form.name} updated as of ${asOf}.` })
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to write off.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={!!waterfall} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Write off remaining balance</DialogTitle>
          <DialogDescription>
            Recognize the entire remaining balance of &ldquo;{waterfall?.name}&rdquo; in a single
            month. This truncates the schedule and appends a balanced write-off journal entry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="writeoff-month">Write off as of</Label>
          <Input
            id="writeoff-month"
            type="month"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleWriteOff} disabled={updateMutation.isPending}>
            {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Write off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default WriteOffDialog

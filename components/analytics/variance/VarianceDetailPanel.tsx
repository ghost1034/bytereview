'use client'

import { useEffect, useState } from 'react'
import { Check, Pencil, Sparkles, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { CommentThread } from '@/components/analytics/CommentThread'
import { formatCurrency } from '@/lib/analytics/format'
import { requiresVarianceExplanation } from '@/lib/analytics/varianceHelpers'
import type {
  VarianceAccountType,
  VarianceData,
  VarianceRowStatus,
} from '@/lib/analytics/varianceTypes'

const ROW_STATUS_VARIANT: Record<
  VarianceRowStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  Pending: 'secondary',
  Accepted: 'default',
  Edited: 'outline',
  Rejected: 'destructive',
}

interface VarianceDetailPanelProps {
  analysisId: string
  row: VarianceData | null
  canEdit: boolean
  accountType?: VarianceAccountType
  customColumns: string[]
  onClose: () => void
  onSave: (updated: VarianceData) => void | Promise<void>
}

export function VarianceDetailPanel({
  analysisId,
  row,
  canEdit,
  customColumns,
  onClose,
  onSave,
}: VarianceDetailPanelProps) {
  const [draft, setDraft] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setDraft(row?.explanation ?? '')
    setIsEditing(false)
  }, [row])

  if (!row) return null

  const handleAccept = async () => {
    setIsSaving(true)
    try {
      await onSave({ ...row, explanation: draft || row.explanation, status: 'Accepted' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReject = async () => {
    setIsSaving(true)
    try {
      await onSave({ ...row, status: 'Rejected' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveEdit = async () => {
    setIsSaving(true)
    try {
      await onSave({ ...row, explanation: draft, status: 'Edited' })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={!!row} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader className="space-y-2 pr-8">
          <div className="flex items-center gap-2">
            <SheetTitle className="truncate text-base">{row.accountName}</SheetTitle>
            <Badge variant={row.isFlagged ? 'destructive' : 'secondary'} className="text-xs">
              {row.isFlagged ? 'Flagged' : 'Not flagged'}
            </Badge>
            <Badge variant={ROW_STATUS_VARIANT[row.status]} className="text-xs">
              {row.status}
            </Badge>
          </div>
          <SheetDescription>
            {row.department ? `${row.department} · ` : ''}
            {row.accountType ?? '—'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-2 rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">
              Variance
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-foreground-muted">Base</div>
                <div className="font-mono">{formatCurrency(row.baseAmount)}</div>
              </div>
              <div>
                <div className="text-foreground-muted">Comparison</div>
                <div className="font-mono">{formatCurrency(row.compAmount)}</div>
              </div>
              <div>
                <div className="text-foreground-muted">Δ ($)</div>
                <div
                  className={`font-mono ${
                    row.isFavorable === true
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : row.isFavorable === false
                        ? 'text-destructive'
                        : ''
                  }`}
                >
                  {formatCurrency(row.variance)}
                </div>
              </div>
              <div>
                <div className="text-foreground-muted">Δ (%)</div>
                <div className="font-mono">
                  {row.variancePercent === 'N/M'
                    ? 'N/M'
                    : `${(row.variancePercent as number).toFixed(1)}%`}
                </div>
              </div>
            </div>
            {row.description && (
              <div className="pt-2 text-xs text-foreground-muted">
                <span className="font-medium text-foreground">Description: </span>
                {row.description}
              </div>
            )}
            {row.customAttributes && customColumns.length > 0 && (
              <div className="space-y-1 pt-2 text-xs">
                {customColumns.map((col) => {
                  const val = row.customAttributes?.[col]
                  if (val === undefined || val === null || val === '') return null
                  return (
                    <div key={col} className="text-foreground-muted">
                      <span className="font-medium text-foreground">{col}: </span>
                      {String(val)}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden />
                <div className="text-sm font-semibold text-foreground">AI explanation</div>
                {row.confidence && (
                  <Badge variant="outline" className="text-xs">
                    {row.confidence} confidence
                  </Badge>
                )}
              </div>
              {canEdit && row.explanation && !isEditing && (
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="mr-1.5 size-3.5" aria-hidden /> Edit
                </Button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={6}
                  placeholder="Write or refine the explanation…"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraft(row.explanation ?? '')
                      setIsEditing(false)
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={isSaving}>
                    Save edit
                  </Button>
                </div>
              </div>
            ) : row.explanation ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {row.explanation}
              </p>
            ) : !requiresVarianceExplanation(row) ? (
              <p className="text-sm text-foreground-muted">
                Below threshold — no explanation required.
              </p>
            ) : (
              <p className="text-sm text-foreground-muted">
                No explanation yet. Click <strong>Explain variances</strong> on the results page to
                generate AI commentary for flagged rows.
              </p>
            )}

            {row.followUp && (
              <div className="rounded-md border border-dashed border-border p-3 text-xs">
                <span className="font-semibold text-foreground">Suggested follow-up: </span>
                <span className="text-foreground-muted">{row.followUp}</span>
              </div>
            )}

            {canEdit && row.explanation && !isEditing && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleAccept}
                  disabled={isSaving || row.status === 'Accepted'}
                >
                  <Check className="mr-1.5 size-4" aria-hidden /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReject}
                  disabled={isSaving || row.status === 'Rejected'}
                >
                  <X className="mr-1.5 size-4" aria-hidden /> Reject
                </Button>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground">Comments</div>
            <CommentThread entityType="variance_row" entityId={`${analysisId}:${row.id}`} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default VarianceDetailPanel

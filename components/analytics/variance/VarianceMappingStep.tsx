'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Plus, X } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateAnalyticsVariance } from '@/hooks/useAnalyticsVariance'
import { useToast } from '@/hooks/use-toast'
import type { AnalyticsAnalysis } from '@/lib/analytics/types'
import { inferVariancePeriodDefaults } from '@/lib/analytics/varianceHelpers'
import {
  readVarianceConfig,
  readVarianceData,
  type VarianceColumnMap,
} from '@/lib/analytics/varianceTypes'

const UNMAPPED = '__none__'

const REQUIRED_FIELDS: { key: keyof VarianceColumnMap; label: string; required: boolean }[] = [
  { key: 'account', label: 'Account', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'period', label: 'Period / Date', required: false },
  { key: 'department', label: 'Department / Class', required: false },
  { key: 'description', label: 'Description / Memo', required: false },
]

interface VarianceMappingStepProps {
  record: AnalyticsAnalysis
  onBack: () => void
  onComplete: () => void
}

export function VarianceMappingStep({ record, onBack, onComplete }: VarianceMappingStepProps) {
  const { toast } = useToast()
  const updateMutation = useUpdateAnalyticsVariance()
  const config = readVarianceConfig(record)
  const data = readVarianceData(record)
  const headers = useMemo(() => data.headers ?? Object.keys(data.rawData?.[0] ?? {}), [data])

  const [columnMap, setColumnMap] = useState<VarianceColumnMap>(config.columnMapping ?? {})
  const [customColumns, setCustomColumns] = useState<string[]>(config.customColumns ?? [])
  const [customColumnMapping, setCustomColumnMapping] = useState<Record<string, string>>(
    config.customColumnMapping ?? {},
  )
  const [newCustomName, setNewCustomName] = useState('')

  const usedColumns = useMemo(() => {
    const used = new Set<string>()
    Object.values(columnMap).forEach((v) => v && used.add(v))
    Object.values(customColumnMapping).forEach((v) => v && used.add(v))
    return used
  }, [columnMap, customColumnMapping])

  const handleAddCustom = () => {
    const name = newCustomName.trim()
    if (!name) return
    if (customColumns.includes(name)) {
      toast({ title: 'Already added', description: `"${name}" is already a custom dimension.` })
      return
    }
    setCustomColumns((prev) => [...prev, name])
    setNewCustomName('')
  }

  const handleRemoveCustom = (name: string) => {
    setCustomColumns((prev) => prev.filter((c) => c !== name))
    setCustomColumnMapping((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const handleSave = async () => {
    if (!columnMap.account || !columnMap.amount) {
      toast({
        title: 'Account and Amount are required',
        description: 'Map both columns before continuing.',
        variant: 'destructive',
      })
      return
    }
    try {
      const shouldInferPeriods =
        config.uploadMode === 'single' && config.periodDefaultsSource !== 'user'
      const periodDefaults = shouldInferPeriods
        ? inferVariancePeriodDefaults(
            config.type ?? 'QoQ',
            data.rawData ?? [],
            columnMap.period,
          )
        : {}
      await updateMutation.mutateAsync({
        analysisId: record.id,
        data: {
          config: {
            ...config,
            columnMapping: columnMap,
            customColumns,
            customColumnMapping,
            ...periodDefaults,
            ...(shouldInferPeriods ? { periodDefaultsSource: 'uploaded-data' as const } : {}),
          } as unknown as Record<string, unknown>,
        },
      })
      onComplete()
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertTitle>Map your columns</AlertTitle>
        <AlertDescription>
          Tell us which of your uploaded columns are <strong>Account</strong> and{' '}
          <strong>Amount</strong>. The rest are optional. You can also declare custom dimension
          columns (e.g. Location, Channel) to use as additional grouping anchors.
        </AlertDescription>
      </Alert>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="text-sm font-semibold text-foreground">Required + standard fields</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {REQUIRED_FIELDS.map(({ key, label, required }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`map-${key}`}>
                {label}
                {required && <span className="ml-1 text-destructive">*</span>}
              </Label>
              <Select
                value={columnMap[key] ?? UNMAPPED}
                onValueChange={(v) =>
                  setColumnMap((prev) => ({ ...prev, [key]: v === UNMAPPED ? undefined : v }))
                }
              >
                <SelectTrigger id={`map-${key}`}>
                  <SelectValue placeholder="(unmapped)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNMAPPED}>(unmapped)</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                      {usedColumns.has(h) && columnMap[key] !== h && (
                        <span className="ml-1 text-xs text-foreground-subtle">(in use)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">Custom dimensions</div>
            <div className="text-xs text-foreground-muted">
              Add anchor columns beyond Account / Department (e.g. Location, Channel, Cost Center).
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {customColumns.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1.5">
              {name}
              <button
                type="button"
                onClick={() => handleRemoveCustom(name)}
                className="hover:text-destructive"
                aria-label={`Remove ${name}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="New dimension name…"
            value={newCustomName}
            onChange={(e) => setNewCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddCustom()
              }
            }}
            className="max-w-xs"
          />
          <Button variant="outline" size="sm" onClick={handleAddCustom}>
            <Plus className="mr-1.5 size-4" aria-hidden /> Add dimension
          </Button>
        </div>

        {customColumns.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {customColumns.map((name) => (
              <div key={name} className="space-y-1.5">
                <Label htmlFor={`custom-map-${name}`}>{name} → source column</Label>
                <Select
                  value={customColumnMapping[name] ?? UNMAPPED}
                  onValueChange={(v) =>
                    setCustomColumnMapping((prev) => {
                      const next = { ...prev }
                      if (v === UNMAPPED) delete next[name]
                      else next[name] = v
                      return next
                    })
                  }
                >
                  <SelectTrigger id={`custom-map-${name}`}>
                    <SelectValue placeholder="(auto-detect)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNMAPPED}>(auto-detect)</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-1.5 size-4" aria-hidden /> Back to upload
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          Continue to thresholds <ChevronRight className="ml-1.5 size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export default VarianceMappingStep

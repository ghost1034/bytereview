'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  useSuggestVarianceThreshold,
  useUpdateAnalyticsVariance,
} from '@/hooks/useAnalyticsVariance'
import { useToast } from '@/hooks/use-toast'
import {
  ACCOUNT_TYPE_OPTIONS,
  ANALYSIS_TYPE_OPTIONS,
  defaultVarianceConfig,
  LOGIC_OPTIONS,
} from '@/lib/analytics/varianceHelpers'
import type { AnalyticsAnalysis } from '@/lib/analytics/types'
import {
  readVarianceConfig,
  readVarianceData,
  type VarianceAccountType,
  type VarianceAISuggestion,
  type VarianceAnalysisType,
  type VarianceConfig,
  type VarianceLogic,
} from '@/lib/analytics/varianceTypes'

interface VarianceConfigStepProps {
  record: AnalyticsAnalysis
  onBack: () => void
  onComplete: () => void
}

export function VarianceConfigStep({ record, onBack, onComplete }: VarianceConfigStepProps) {
  const { toast } = useToast()
  const updateMutation = useUpdateAnalyticsVariance()
  const suggestMutation = useSuggestVarianceThreshold()

  const persisted = readVarianceConfig(record)
  const data = readVarianceData(record)
  const fallback = defaultVarianceConfig(persisted.uploadMode ?? 'dual')

  const [config, setConfig] = useState<VarianceConfig>({
    ...fallback,
    ...persisted,
    columnMapping: persisted.columnMapping ?? {},
    customColumns: persisted.customColumns ?? [],
    customColumnMapping: persisted.customColumnMapping ?? {},
  } as VarianceConfig)

  const [suggestion, setSuggestion] = useState<VarianceAISuggestion | null>(null)

  const anchorOptions = useMemo(() => {
    const opts = ['Account']
    if (config.columnMapping.department) opts.push('Department')
    for (const c of config.customColumns) opts.push(c)
    return opts
  }, [config.columnMapping.department, config.customColumns])

  const toggleAnchor = (anchor: string, checked: boolean) => {
    setConfig((prev) => {
      const next = new Set(prev.analysisAnchors)
      if (checked) next.add(anchor)
      else next.delete(anchor)
      // Account is implicit even if unchecked — but if user explicitly opts in we keep it set.
      return { ...prev, analysisAnchors: Array.from(next) }
    })
  }

  const handleSuggest = async () => {
    if (!data.rawData || data.rawData.length === 0) {
      toast({
        title: 'No data',
        description: 'Upload GL data before asking for a suggestion.',
        variant: 'destructive',
      })
      return
    }
    try {
      const response = await suggestMutation.mutateAsync({ data: data.rawData })
      setSuggestion({
        thresholdDollar: response.thresholdDollar,
        thresholdPercent: response.thresholdPercent,
        logic: response.logic as VarianceLogic,
        explanation: response.explanation,
      })
    } catch (error) {
      toast({
        title: 'Suggestion failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      })
    }
  }

  const acceptSuggestion = () => {
    if (!suggestion) return
    setConfig((prev) => ({
      ...prev,
      thresholdDollar: suggestion.thresholdDollar,
      thresholdPercent: suggestion.thresholdPercent,
      logic: suggestion.logic,
    }))
    toast({ title: 'Thresholds updated', description: 'AI suggestion applied.' })
  }

  const handleSave = async () => {
    if (!Number.isFinite(config.thresholdDollar) || config.thresholdDollar < 0) {
      toast({ title: 'Invalid dollar threshold', variant: 'destructive' })
      return
    }
    if (!Number.isFinite(config.thresholdPercent) || config.thresholdPercent < 0) {
      toast({ title: 'Invalid percent threshold', variant: 'destructive' })
      return
    }
    try {
      await updateMutation.mutateAsync({
        analysisId: record.id,
        data: { config: config as unknown as Record<string, unknown> },
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
        <AlertTitle>Configure thresholds and grouping</AlertTitle>
        <AlertDescription>
          Variances will be flagged based on the materiality thresholds below. Use the AI suggestion
          to get a data-driven starting point.
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold text-foreground">Materiality thresholds</div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="threshold-dollar">Dollar threshold ($)</Label>
              <Input
                id="threshold-dollar"
                type="number"
                min={0}
                value={config.thresholdDollar}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, thresholdDollar: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="threshold-percent">Percent threshold (%)</Label>
              <Input
                id="threshold-percent"
                type="number"
                min={0}
                step={0.5}
                value={config.thresholdPercent}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, thresholdPercent: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Flag when</Label>
            <RadioGroup
              value={config.logic}
              onValueChange={(v) => setConfig((prev) => ({ ...prev, logic: v as VarianceLogic }))}
            >
              {LOGIC_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-start gap-2 rounded-md border border-border p-3">
                  <RadioGroupItem value={opt.value} id={`logic-${opt.value}`} className="mt-0.5" />
                  <Label htmlFor={`logic-${opt.value}`} className="cursor-pointer space-y-0.5 font-normal">
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-foreground-muted">{opt.hint}</div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="rounded-md border border-dashed border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">AI suggestion</div>
                <div className="text-xs text-foreground-muted">
                  Sample your GL and propose thresholds with a rationale.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSuggest}
                disabled={suggestMutation.isPending}
              >
                {suggestMutation.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="mr-1.5 size-4" aria-hidden />
                )}
                Suggest
              </Button>
            </div>

            {suggestion && (
              <div className="mt-3 space-y-2 rounded-md bg-surface-raised p-3 text-sm">
                <div className="flex flex-wrap gap-3 font-mono text-xs">
                  <span>
                    $: <strong>{suggestion.thresholdDollar.toLocaleString()}</strong>
                  </span>
                  <span>
                    %: <strong>{suggestion.thresholdPercent}</strong>
                  </span>
                  <span>
                    Logic: <strong>{suggestion.logic}</strong>
                  </span>
                </div>
                <p className="text-xs text-foreground-muted">{suggestion.explanation}</p>
                <div className="flex justify-end">
                  <Button size="sm" onClick={acceptSuggestion}>
                    Accept suggestion
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold text-foreground">Analysis setup</div>

          <div className="space-y-1.5">
            <Label htmlFor="analysis-type">Comparison type</Label>
            <Select
              value={config.type}
              onValueChange={(v) =>
                setConfig((prev) => ({ ...prev, type: v as VarianceAnalysisType }))
              }
            >
              <SelectTrigger id="analysis-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANALYSIS_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account-type">Account type</Label>
            <Select
              value={config.accountType}
              onValueChange={(v) =>
                setConfig((prev) => ({ ...prev, accountType: v as VarianceAccountType }))
              }
            >
              <SelectTrigger id="account-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-foreground-muted">
              Drives the favorable / unfavorable badges on each row.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Analysis anchors</Label>
            <p className="text-xs text-foreground-muted">
              Variances are aggregated to the most-detailed combination of these dimensions.
            </p>
            <div className="space-y-2">
              {anchorOptions.map((anchor) => (
                <div key={anchor} className="flex items-center gap-2">
                  <Checkbox
                    id={`anchor-${anchor}`}
                    checked={config.analysisAnchors.includes(anchor)}
                    onCheckedChange={(c) => toggleAnchor(anchor, c === true)}
                  />
                  <Label htmlFor={`anchor-${anchor}`} className="font-normal">
                    {anchor}
                    {anchor === 'Account' && (
                      <span className="ml-1 text-xs text-foreground-subtle">(recommended)</span>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {config.uploadMode === 'single' && (
            <div className="space-y-3 rounded-md border border-border bg-surface-raised p-3">
              <div className="text-sm font-medium text-foreground">Period date ranges</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="base-start">Base start</Label>
                  <Input
                    id="base-start"
                    type="date"
                    value={config.basePeriodStart}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, basePeriodStart: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="base-end">Base end</Label>
                  <Input
                    id="base-end"
                    type="date"
                    value={config.basePeriodEnd}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, basePeriodEnd: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="comp-start">Comparison start</Label>
                  <Input
                    id="comp-start"
                    type="date"
                    value={config.compPeriodStart}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, compPeriodStart: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="comp-end">Comparison end</Label>
                  <Input
                    id="comp-end"
                    type="date"
                    value={config.compPeriodEnd}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, compPeriodEnd: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Positive values are</Label>
            <RadioGroup
              value={config.positiveIs}
              onValueChange={(v) =>
                setConfig((prev) => ({ ...prev, positiveIs: v as 'Debit' | 'Credit' }))
              }
              className="flex gap-3"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Debit" id="pos-debit" />
                <Label htmlFor="pos-debit" className="font-normal">
                  Debit
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Credit" id="pos-credit" />
                <Label htmlFor="pos-credit" className="font-normal">
                  Credit
                </Label>
              </div>
            </RadioGroup>
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ChevronLeft className="mr-1.5 size-4" aria-hidden /> Back to mapping
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          Continue to review <ChevronRight className="ml-1.5 size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

export default VarianceConfigStep

'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  FileUp,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import {
  useComplianceCheckAnalyticsAmortization,
  useCreateAnalyticsAmortization,
  useExtractAnalyticsAmortization,
  useGenerateAnalyticsAmortizationSchedule,
  useUpdateAnalyticsAmortization,
} from '@/hooks/useAnalyticsAmortization'
import {
  mergeFormFromApi,
  splitFormForApi,
  buildMacrsScheduleRequest,
  buildGaapScheduleRequest,
  gaapMethodKey,
  generateAssetSchedules,
  canGenerateSchedules,
  normalizeMacrsScheduleRows,
} from '@/lib/analytics/amortizationHelpers'
import {
  ASSET_TYPES,
  ASSET_TYPE_DEFAULTS,
  GAAP_METHODS,
  MACRS_PROPERTY_CLASSES,
  TAX_METHODS,
  createDefaultAmortizationForm,
  type AmortizationForm as AmortizationFormState,
  type AssetType,
  type MacrsPropertyClass,
  type ScheduleMethodKey,
  type ScheduleRow,
} from '@/lib/analytics/amortizationTypes'
import { parseDocx, parsePDF } from '@/lib/analytics/fileParser'
import type { AnalyticsAmortization } from '@/lib/analytics/types'
import { AmortizationJournalTable } from './AmortizationJournalTable'
import { AmortizationScheduleComparisonTable } from './AmortizationScheduleComparisonTable'
import { AmortizationScheduleTable } from './AmortizationScheduleTable'

const NO_CLIENT = '__none__'

interface AmortizationFormProps {
  initial?: AnalyticsAmortization | null
  /** Pre-fills the client dropdown for new assets when no `initial` is set. */
  initialClientId?: string | null
  onDone: () => void
}

function isLease(type: string) {
  return type === 'Lease - Operating' || type === 'Lease - Finance'
}
function isLoan(type: string) {
  return type === 'Loan Amortization'
}
function isIntangible(type: string) {
  return type === 'Intangible Assets'
}
function isSoftware(type: string) {
  return type === 'Software Costs'
}
function isFixedAsset(type: string) {
  return type.startsWith('Fixed Assets')
}

export function AmortizationForm({ initial, initialClientId, onDone }: AmortizationFormProps) {
  const { toast } = useToast()
  const { data: clientsData } = useAnalyticsClients()
  const clients = clientsData?.clients ?? []

  const createMutation = useCreateAnalyticsAmortization()
  const updateMutation = useUpdateAnalyticsAmortization()
  const extractMutation = useExtractAnalyticsAmortization()
  const complianceMutation = useComplianceCheckAnalyticsAmortization()
  const scheduleMutation = useGenerateAnalyticsAmortizationSchedule()
  const isSaving = createMutation.isPending || updateMutation.isPending

  const [form, setForm] = useState<AmortizationFormState>(
    () => (initial ? mergeFormFromApi(initial) : createDefaultAmortizationForm()),
  )
  const [clientId, setClientId] = useState<string | null>(
    initial?.client_id ?? initialClientId ?? null,
  )
  const [confidence, setConfidence] = useState<Record<string, number>>({})
  const [extracting, setExtracting] = useState(false)
  const [schedule, setSchedule] = useState<ScheduleRow[]>(
    () => ((initial?.schedule ?? []) as unknown as ScheduleRow[]) || [],
  )
  const [taxSchedule, setTaxSchedule] = useState<ScheduleRow[]>(() =>
    normalizeMacrsScheduleRows(
      ((initial?.tax_schedule ?? []) as unknown as ScheduleRow[]) || [],
      initial?.cost_basis ?? 0,
    ),
  )
  const [complianceInsight, setComplianceInsight] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Reset state if `initial` changes (edit a different row).
  useEffect(() => {
    if (initial) {
      setForm(mergeFormFromApi(initial))
      setClientId(initial.client_id ?? null)
      setSchedule(((initial.schedule ?? []) as unknown as ScheduleRow[]) || [])
      setTaxSchedule(
        normalizeMacrsScheduleRows(
          ((initial.tax_schedule ?? []) as unknown as ScheduleRow[]) || [],
          initial.cost_basis ?? 0,
        ),
      )
    }
  }, [initial])

  const set = (patch: Partial<AmortizationFormState>) => setForm((f) => ({ ...f, ...patch }))

  const handleAssetType = (type: AssetType) => {
    const sample = ASSET_TYPE_DEFAULTS[type]
    set({
      assetType: type,
      assetName: sample?.assetName ?? form.assetName,
      department: sample?.department ?? form.department,
      vendor: sample?.vendor ?? form.vendor,
    })
  }

  const handleFile = async (file: File) => {
    setExtracting(true)
    try {
      const lower = file.name.toLowerCase()
      let text: string
      if (lower.endsWith('.pdf')) text = await parsePDF(file)
      else if (lower.endsWith('.docx')) text = await parseDocx(file)
      else text = await file.text()

      const res = await extractMutation.mutateAsync({ documentText: text })
      const f = (res.form ?? {}) as Record<string, unknown>
      set({
        assetName: (f.assetName as string) || form.assetName,
        assetType: (f.assetType as string) || form.assetType,
        vendor: (f.vendor as string) || form.vendor,
        costBasis: (f.costBasis as number) ?? form.costBasis,
        startDate: (f.startDate as string) || form.startDate,
        usefulLifeMonths: (f.usefulLifeMonths as number) ?? form.usefulLifeMonths,
        gaapMethod: (f.gaapMethod as string) || form.gaapMethod,
        leaseClassification:
          ((f.leaseClassification as string) as 'Operating' | 'Finance' | '') ||
          form.leaseClassification,
        paymentAmount: (f.paymentAmount as number) ?? form.paymentAmount,
        paymentFrequency:
          ((f.paymentFrequency as string) as AmortizationFormState['paymentFrequency']) ||
          form.paymentFrequency,
        paymentTiming:
          ((f.paymentTiming as string) as AmortizationFormState['paymentTiming']) ||
          form.paymentTiming,
        ibr: (f.ibr as number) ?? form.ibr,
      })
      setConfidence((res.confidenceScores as Record<string, number>) ?? {})
      toast({ title: 'Document extracted', description: 'Review the prefilled fields below.' })
    } catch (error) {
      toast({
        title: 'Extraction failed',
        description: error instanceof Error ? error.message : 'Could not read that document.',
        variant: 'destructive',
      })
    } finally {
      setExtracting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const buildScheduleRequest = (method: ScheduleMethodKey) => buildGaapScheduleRequest(form, method)

  const handleGenerate = async () => {
    if (!form.startDate) {
      toast({ title: 'Start date required', variant: 'destructive' })
      return
    }
    if (!form.usefulLifeMonths || form.usefulLifeMonths <= 0) {
      if (!isLoan(form.assetType) && !isLease(form.assetType)) {
        toast({ title: 'Useful life required', variant: 'destructive' })
        return
      }
    }
    try {
      const gaapKey = gaapMethodKey(form)
      const res = await scheduleMutation.mutateAsync(buildScheduleRequest(gaapKey))
      setSchedule((res.schedule ?? []) as unknown as ScheduleRow[])

      if (form.taxMethod === 'MACRS') {
        const taxRes = await scheduleMutation.mutateAsync(buildMacrsScheduleRequest(form))
        setTaxSchedule(
          normalizeMacrsScheduleRows(
            (taxRes.schedule ?? []) as unknown as ScheduleRow[],
            form.costBasis ?? 0,
          ),
        )
      } else {
        setTaxSchedule([])
      }
      toast({ title: 'Schedule generated', description: `${res.schedule?.length ?? 0} periods.` })
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Schedule generation failed.',
        variant: 'destructive',
      })
    }
  }

  const handleCompliance = async () => {
    try {
      const res = await complianceMutation.mutateAsync({
        form: form as unknown as { [key: string]: unknown },
      })
      setComplianceInsight(res.insight)
    } catch (error) {
      toast({
        title: 'Compliance check failed',
        description: error instanceof Error ? error.message : 'Could not run check.',
        variant: 'destructive',
      })
    }
  }

  const handleSave = async () => {
    if (!form.assetName.trim()) {
      toast({ title: 'Asset name required', variant: 'destructive' })
      return
    }
    const payload = splitFormForApi(form, { clientId, status: 'published', approvalStatus: 'approved' })
    try {
      let gaapSchedule = schedule
      let taxSched = taxSchedule
      if (gaapSchedule.length === 0 && canGenerateSchedules(form)) {
        const generated = await generateAssetSchedules(form, (req) =>
          scheduleMutation.mutateAsync(req) as unknown as Promise<{ schedule?: ScheduleRow[] }>,
        )
        gaapSchedule = generated.schedule
        taxSched = generated.taxSchedule
        setSchedule(gaapSchedule)
        setTaxSchedule(taxSched)
      }

      if (initial) {
        await updateMutation.mutateAsync({
          amortizationId: initial.id,
          data: { ...payload, schedule: gaapSchedule, tax_schedule: taxSched },
        })
        toast({ title: 'Asset updated', description: `${form.assetName} has been saved.` })
      } else {
        await createMutation.mutateAsync({
          ...payload,
          schedule: gaapSchedule,
          tax_schedule: taxSched,
        })
        toast({ title: 'Asset created', description: `${form.assetName} has been added.` })
      }
      onDone()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save asset.',
        variant: 'destructive',
      })
    }
  }

  const hint = (key: string) => {
    const score = confidence[key]
    if (score == null) return null
    return (
      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
        <Sparkles className="size-2.5" aria-hidden /> {Math.round(score)}%
      </span>
    )
  }

  const aType = form.assetType
  const showFixedAsset = isFixedAsset(aType)
  const showLease = isLease(aType)
  const showLoan = isLoan(aType)
  const showIntangible = isIntangible(aType)
  const showSoftware = isSoftware(aType)
  const showTax = form.taxMethod === 'MACRS' || showFixedAsset

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onDone}>
          <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to portfolio
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCompliance} disabled={complianceMutation.isPending}>
            {complianceMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="mr-1.5 size-4" aria-hidden />
            )}
            Check compliance
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            {initial ? 'Save changes' : 'Save asset'}
          </Button>
        </div>
      </div>

      {/* AI extraction */}
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium text-foreground">Prefill from a document</p>
          <p className="text-foreground-muted">
            Upload a contract, invoice, or lease and AI will extract the key fields.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={extracting}>
          {extracting ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <FileUp className="mr-2 size-4" aria-hidden />
          )}
          {extracting ? 'Extracting…' : 'Upload document'}
        </Button>
      </div>

      {/* Compliance insight */}
      {complianceInsight && (
        <Alert>
          <ShieldCheck className="size-4" aria-hidden />
          <AlertTitle>Compliance insight</AlertTitle>
          <AlertDescription>{complianceInsight}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: details */}
        <div className="space-y-6">
          {/* Common details */}
          <div className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Asset details</h3>

            <div className="space-y-1.5">
              <Label htmlFor="amort-type">Asset type</Label>
              <Select value={form.assetType} onValueChange={(v) => handleAssetType(v as AssetType)}>
                <SelectTrigger id="amort-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amort-name">
                Asset name {hint('assetName')}
              </Label>
              <Input
                id="amort-name"
                value={form.assetName}
                onChange={(e) => set({ assetName: e.target.value })}
                placeholder="2026 Office HVAC Replacement"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amort-tag">Asset tag / ID</Label>
                <Input
                  id="amort-tag"
                  value={form.assetTag ?? ''}
                  onChange={(e) => set({ assetTag: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-vendor">Vendor {hint('vendor')}</Label>
                <Input
                  id="amort-vendor"
                  value={form.vendor ?? ''}
                  onChange={(e) => set({ vendor: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amort-dept">Department</Label>
                <Input
                  id="amort-dept"
                  value={form.department ?? ''}
                  onChange={(e) => set({ department: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-loc">Location</Label>
                <Input
                  id="amort-loc"
                  value={form.location ?? ''}
                  onChange={(e) => set({ location: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amort-client">Client (optional)</Label>
              <Select
                value={clientId ?? NO_CLIENT}
                onValueChange={(v) => setClientId(v === NO_CLIENT ? null : v)}
              >
                <SelectTrigger id="amort-client">
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
              <Label htmlFor="amort-desc">Description</Label>
              <Textarea
                id="amort-desc"
                rows={2}
                value={form.description ?? ''}
                onChange={(e) => set({ description: e.target.value })}
              />
            </div>
          </div>

          {/* Financial */}
          <div className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Financial</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amort-cost">Cost basis</Label>
                <Input
                  id="amort-cost"
                  type="number"
                  value={Number.isNaN(form.costBasis) ? '' : form.costBasis}
                  onChange={(e) => set({ costBasis: parseFloat(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-salvage">Salvage value</Label>
                <Input
                  id="amort-salvage"
                  type="number"
                  value={Number.isNaN(form.salvageValue) ? '' : form.salvageValue}
                  onChange={(e) => set({ salvageValue: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amort-start">
                  Start date {hint('startDate')}
                </Label>
                <Input
                  id="amort-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set({ startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-life">
                  Useful life (months) {hint('usefulLifeMonths')}
                </Label>
                <Input
                  id="amort-life"
                  type="number"
                  value={Number.isNaN(form.usefulLifeMonths) ? '' : form.usefulLifeMonths}
                  onChange={(e) => set({ usefulLifeMonths: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amort-gaap">GAAP method</Label>
                <Select value={form.gaapMethod} onValueChange={(v) => set({ gaapMethod: v })}>
                  <SelectTrigger id="amort-gaap">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GAAP_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-tax">Tax method</Label>
                <Select value={form.taxMethod} onValueChange={(v) => set({ taxMethod: v })}>
                  <SelectTrigger id="amort-tax">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amort-expacct">Expense account</Label>
                <Input
                  id="amort-expacct"
                  value={form.expenseAccount ?? ''}
                  onChange={(e) => set({ expenseAccount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-accacct">Accumulated account</Label>
                <Input
                  id="amort-accacct"
                  value={form.accumulatedAccount ?? ''}
                  onChange={(e) => set({ accumulatedAccount: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amort-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger id="amort-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Disposed">Disposed</SelectItem>
                  <SelectItem value="Fully Depreciated">Fully Depreciated</SelectItem>
                  <SelectItem value="Impaired">Impaired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Type-specific */}
          {showFixedAsset && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">Fixed asset details</h3>
              <div className="space-y-1.5">
                <Label htmlFor="amort-category">Asset category</Label>
                <Select
                  value={form.assetCategory ?? ''}
                  onValueChange={(v) => set({ assetCategory: v })}
                >
                  <SelectTrigger id="amort-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Machinery & Equipment">Machinery & Equipment</SelectItem>
                    <SelectItem value="Furniture & Fixtures">Furniture & Fixtures</SelectItem>
                    <SelectItem value="Vehicles">Vehicles</SelectItem>
                    <SelectItem value="Computer & IT">Computer & IT</SelectItem>
                    <SelectItem value="Buildings">Buildings</SelectItem>
                    <SelectItem value="Improvements">Improvements</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-cond">Physical condition</Label>
                  <Select
                    value={form.physicalCondition ?? 'New'}
                    onValueChange={(v) => set({ physicalCondition: v })}
                  >
                    <SelectTrigger id="amort-cond">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Used">Used</SelectItem>
                      <SelectItem value="Refurbished">Refurbished</SelectItem>
                      <SelectItem value="Damaged">Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-capcost">Capitalized costs</Label>
                  <Input
                    id="amort-capcost"
                    type="number"
                    value={form.capitalizedCosts ?? ''}
                    onChange={(e) => set({ capitalizedCosts: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <SwitchRow
                label="Qualified Improvement Property (QIP)"
                checked={!!form.isQip}
                onChange={(v) => set({ isQip: v })}
              />
            </div>
          )}

          {showLease && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">Lease details (ASC 842)</h3>
              <div className="space-y-1.5">
                <Label htmlFor="amort-leaseclass">Classification</Label>
                <Select
                  value={form.leaseClassification || 'Operating'}
                  onValueChange={(v) => set({ leaseClassification: v as 'Operating' | 'Finance' })}
                >
                  <SelectTrigger id="amort-leaseclass">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Operating">Operating</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-payamt">
                    Payment amount {hint('paymentAmount')}
                  </Label>
                  <Input
                    id="amort-payamt"
                    type="number"
                    value={form.paymentAmount ?? ''}
                    onChange={(e) => set({ paymentAmount: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-payfreq">Payment frequency</Label>
                  <Select
                    value={form.paymentFrequency ?? 'Monthly'}
                    onValueChange={(v) =>
                      set({ paymentFrequency: v as AmortizationFormState['paymentFrequency'] })
                    }
                  >
                    <SelectTrigger id="amort-payfreq">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                      <SelectItem value="Quarterly">Quarterly</SelectItem>
                      <SelectItem value="Semi-Annually">Semi-Annually</SelectItem>
                      <SelectItem value="Annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-paytim">Payment timing</Label>
                  <Select
                    value={form.paymentTiming ?? 'End of Period'}
                    onValueChange={(v) =>
                      set({ paymentTiming: v as AmortizationFormState['paymentTiming'] })
                    }
                  >
                    <SelectTrigger id="amort-paytim">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Beginning of Period">Beginning of Period</SelectItem>
                      <SelectItem value="End of Period">End of Period</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-ibr">
                    Incremental borrowing rate (%) {hint('ibr')}
                  </Label>
                  <Input
                    id="amort-ibr"
                    type="number"
                    step="0.01"
                    value={form.ibr ?? ''}
                    onChange={(e) => set({ ibr: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-idc">Initial direct costs</Label>
                  <Input
                    id="amort-idc"
                    type="number"
                    value={form.initialDirectCosts ?? ''}
                    onChange={(e) => set({ initialDirectCosts: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-prepaid">Prepaid payments</Label>
                  <Input
                    id="amort-prepaid"
                    type="number"
                    value={form.prepaidLeasePayments ?? ''}
                    onChange={(e) => set({ prepaidLeasePayments: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-incentive">Lease incentives</Label>
                  <Input
                    id="amort-incentive"
                    type="number"
                    value={form.leaseIncentives ?? ''}
                    onChange={(e) => set({ leaseIncentives: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          )}

          {showLoan && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">Loan details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-principal">Principal</Label>
                  <Input
                    id="amort-principal"
                    type="number"
                    value={form.principalAmount ?? ''}
                    onChange={(e) => set({ principalAmount: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-rate">Interest rate (%)</Label>
                  <Input
                    id="amort-rate"
                    type="number"
                    step="0.01"
                    value={form.interestRate ?? ''}
                    onChange={(e) => set({ interestRate: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-ratetype">Rate type</Label>
                <Select
                  value={form.rateType ?? 'Fixed'}
                  onValueChange={(v) => set({ rateType: v })}
                >
                  <SelectTrigger id="amort-ratetype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed</SelectItem>
                    <SelectItem value="Variable">Variable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-loanterm">Loan term (months)</Label>
                  <Input
                    id="amort-loanterm"
                    type="number"
                    value={form.loanTerm ?? ''}
                    onChange={(e) => set({ loanTerm: parseInt(e.target.value, 10) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-balloon">Balloon payment</Label>
                  <Input
                    id="amort-balloon"
                    type="number"
                    value={form.balloonPayment ?? ''}
                    onChange={(e) => set({ balloonPayment: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-orig">Origination date</Label>
                  <Input
                    id="amort-orig"
                    type="date"
                    value={form.originationDate ?? ''}
                    onChange={(e) => set({ originationDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-first">First payment date</Label>
                  <Input
                    id="amort-first"
                    type="date"
                    value={form.firstPaymentDate ?? ''}
                    onChange={(e) => set({ firstPaymentDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {showIntangible && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">Intangible details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-inttype">Intangible type</Label>
                  <Select
                    value={form.intangibleType ?? 'Patent'}
                    onValueChange={(v) => set({ intangibleType: v })}
                  >
                    <SelectTrigger id="amort-inttype">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Patent">Patent</SelectItem>
                      <SelectItem value="Trademark">Trademark</SelectItem>
                      <SelectItem value="Copyright">Copyright</SelectItem>
                      <SelectItem value="Goodwill">Goodwill</SelectItem>
                      <SelectItem value="Customer List">Customer List</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-deflife">Life type</Label>
                  <Select
                    value={(form.definiteLife as string) ?? 'Definite'}
                    onValueChange={(v) => set({ definiteLife: v })}
                  >
                    <SelectTrigger id="amort-deflife">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Definite">Definite</SelectItem>
                      <SelectItem value="Indefinite">Indefinite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-legal">Legal life (months)</Label>
                  <Input
                    id="amort-legal"
                    type="number"
                    value={form.legalLife ?? ''}
                    onChange={(e) => set({ legalLife: parseInt(e.target.value, 10) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-benefit">Expected benefit (months)</Label>
                  <Input
                    id="amort-benefit"
                    type="number"
                    value={form.expectedBenefitPeriod ?? ''}
                    onChange={(e) => set({ expectedBenefitPeriod: parseInt(e.target.value, 10) })}
                  />
                </div>
              </div>
            </div>
          )}

          {showSoftware && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Software details (ASC 350-40)</h3>
                <p className="mt-1 text-xs text-foreground-muted">
                  Reference metadata for ASC 350-40 classification and audit documentation. Schedules
                  and journal entries use <span className="font-medium text-foreground">Cost basis</span>{' '}
                  from Financial above — fields here do not add to or override that amount.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-sw-stage">Stage</Label>
                  <Select
                    value={form.softwareStage ?? 'Application Development'}
                    onValueChange={(v) => set({ softwareStage: v })}
                  >
                    <SelectTrigger id="amort-sw-stage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Preliminary">Preliminary</SelectItem>
                      <SelectItem value="Application Development">Application Development</SelectItem>
                      <SelectItem value="Post-Implementation">Post-Implementation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-sw-use">Use</Label>
                  <Select
                    value={(form.internalExternal as string) ?? 'Internal'}
                    onValueChange={(v) => set({ internalExternal: v })}
                  >
                    <SelectTrigger id="amort-sw-use">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Internal">Internal-Use</SelectItem>
                      <SelectItem value="External">External-Sale</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-totcap">Total capitalized cost</Label>
                <p className="text-xs text-foreground-muted">
                  Documented capitalization total for reference; not added to cost basis automatically.
                </p>
                <Input
                  id="amort-totcap"
                  type="number"
                  value={form.totalCapitalizedCost ?? ''}
                  onChange={(e) => set({ totalCapitalizedCost: parseFloat(e.target.value) })}
                />
              </div>
            </div>
          )}

          {/* Tax details */}
          {showTax && (
            <div className="space-y-4 rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground">Tax details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amort-macrs">MACRS property class</Label>
                  <Select
                    value={form.macrsPropertyClass ?? '5-year'}
                    onValueChange={(v) => set({ macrsPropertyClass: v as MacrsPropertyClass })}
                  >
                    <SelectTrigger id="amort-macrs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MACRS_PROPERTY_CLASSES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amort-macrs-sys">MACRS system</Label>
                  <Select
                    value={form.macrsSystem ?? 'GDS'}
                    onValueChange={(v) => set({ macrsSystem: v })}
                  >
                    <SelectTrigger id="amort-macrs-sys">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GDS">GDS</SelectItem>
                      <SelectItem value="ADS">ADS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amort-convention">Convention</Label>
                <Select
                  value={form.convention ?? 'Half-Year'}
                  onValueChange={(v) => set({ convention: v })}
                >
                  <SelectTrigger id="amort-convention">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Half-Year">Half-Year</SelectItem>
                    <SelectItem value="Mid-Quarter">Mid-Quarter</SelectItem>
                    <SelectItem value="Mid-Month">Mid-Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <SwitchRow
                  label="Section 179 election"
                  checked={!!form.section179Election}
                  onChange={(v) => set({ section179Election: v })}
                />
                {form.section179Election && (
                  <div className="space-y-1.5">
                    <Label htmlFor="amort-179amt">§179 amount</Label>
                    <Input
                      id="amort-179amt"
                      type="number"
                      value={form.section179Amount ?? ''}
                      onChange={(e) => set({ section179Amount: parseFloat(e.target.value) })}
                    />
                  </div>
                )}
                <SwitchRow
                  label="Bonus depreciation election"
                  checked={!!form.bonusDepreciationElection}
                  onChange={(v) => set({ bonusDepreciationElection: v })}
                />
                {form.bonusDepreciationElection && (
                  <div className="space-y-1.5">
                    <Label htmlFor="amort-bonus">Bonus depreciation %</Label>
                    <Input
                      id="amort-bonus"
                      value={form.bonusDepreciationPercentage ?? ''}
                      onChange={(e) => set({ bonusDepreciationPercentage: e.target.value })}
                      placeholder="60%"
                    />
                  </div>
                )}
                <SwitchRow
                  label="Listed property"
                  checked={!!form.listedProperty}
                  onChange={(v) => set({ listedProperty: v })}
                />
                {form.listedProperty && (
                  <div className="space-y-1.5">
                    <Label htmlFor="amort-bus">Business use %</Label>
                    <Input
                      id="amort-bus"
                      type="number"
                      value={form.businessUsePercentage ?? ''}
                      onChange={(e) => set({ businessUsePercentage: parseFloat(e.target.value) })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: schedule + journal preview */}
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Schedule</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={scheduleMutation.isPending}
            >
              {scheduleMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="mr-1.5 size-4" aria-hidden />
              )}
              Generate
            </Button>
          </div>
          <Tabs defaultValue="gaap">
            <TabsList>
              <TabsTrigger value="gaap">GAAP ({schedule.length})</TabsTrigger>
              {taxSchedule.length > 0 && (
                <TabsTrigger value="tax">Tax ({taxSchedule.length})</TabsTrigger>
              )}
              {taxSchedule.length > 0 && (
                <TabsTrigger value="comparison">GAAP vs Tax</TabsTrigger>
              )}
              <TabsTrigger value="journal">Journal entries</TabsTrigger>
            </TabsList>
            <TabsContent value="gaap" className="mt-4">
              <AmortizationScheduleTable schedule={schedule} method={gaapMethodKey(form)} />
            </TabsContent>
            {taxSchedule.length > 0 && (
              <TabsContent value="tax" className="mt-4">
                <AmortizationScheduleTable schedule={taxSchedule} method="macrs" label="MACRS tax schedule" />
              </TabsContent>
            )}
            {taxSchedule.length > 0 && (
              <TabsContent value="comparison" className="mt-4">
                <AmortizationScheduleComparisonTable
                  schedule={schedule}
                  taxSchedule={taxSchedule}
                />
              </TabsContent>
            )}
            <TabsContent value="journal" className="mt-4">
              <AmortizationJournalTable
                schedule={schedule}
                form={form}
                amortizationId={initial?.id}
                clientId={clientId}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="cursor-pointer text-sm font-normal text-foreground">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

export default AmortizationForm

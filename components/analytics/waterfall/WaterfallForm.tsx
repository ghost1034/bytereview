'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, FileUp, Loader2, Sparkles } from 'lucide-react'

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import {
  useCreateAnalyticsWaterfall,
  useExtractAnalyticsWaterfall,
  useUpdateAnalyticsWaterfall,
} from '@/hooks/useAnalyticsWaterfall'
import { parseDocx, parsePDF } from '@/lib/analytics/fileParser'
import { calculateWaterfall } from '@/lib/analytics/waterfallEngine'
import type { SavedWaterfall } from '@/lib/analytics/waterfallData'
import {
  RECOGNITION_METHODS,
  SUBTYPE_SAMPLE_DEFAULTS,
  WATERFALL_SUBTYPES,
  createDefaultWaterfallForm,
  type WaterfallForm as WaterfallFormState,
  type WaterfallSubtype,
} from '@/lib/analytics/waterfallTypes'
import { WaterfallJournalTable } from './WaterfallJournalTable'
import { WaterfallScheduleTable } from './WaterfallScheduleTable'

const NO_CLIENT = '__none__'

interface WaterfallFormProps {
  /** When set, the form edits this saved waterfall; otherwise it creates a new one. */
  initial?: SavedWaterfall | null
  onDone: () => void
}

export function WaterfallForm({ initial, onDone }: WaterfallFormProps) {
  const { toast } = useToast()
  const { data: clientsData } = useAnalyticsClients()
  const clients = clientsData?.clients ?? []

  const createMutation = useCreateAnalyticsWaterfall()
  const updateMutation = useUpdateAnalyticsWaterfall()
  const extractMutation = useExtractAnalyticsWaterfall()
  const isSaving = createMutation.isPending || updateMutation.isPending

  const [form, setForm] = useState<WaterfallFormState>(
    () => initial?.form ?? createDefaultWaterfallForm(),
  )
  const [clientId, setClientId] = useState<string | null>(initial?.clientId ?? null)
  const [confidence, setConfidence] = useState<Record<string, number>>({})
  const [extracting, setExtracting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { schedule, journalEntries } = useMemo(() => calculateWaterfall(form), [form])

  const set = (patch: Partial<WaterfallFormState>) => setForm((f) => ({ ...f, ...patch }))

  const handleSubtype = (type: WaterfallSubtype) => {
    // Mirror CPAAnalytics' handleTypeChange: reseed sample name/party/amount.
    const sample = SUBTYPE_SAMPLE_DEFAULTS[type]
    set({ type, name: sample.name, partyName: sample.partyName, totalAmount: sample.totalAmount })
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
      const extractedType = WATERFALL_SUBTYPES.includes(res.type as WaterfallSubtype)
        ? (res.type as WaterfallSubtype)
        : form.type
      set({
        type: extractedType,
        name: res.name || form.name,
        partyName: res.partyName || form.partyName,
        totalAmount: res.totalAmount || form.totalAmount,
        startDate: res.startDate || form.startDate,
        endDate: res.endDate || form.endDate,
      })
      setConfidence((res.confidenceScores as Record<string, number>) ?? {})
      toast({ title: 'Contract extracted', description: 'Review the prefilled fields below.' })
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

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name required', description: 'Give this schedule a name.', variant: 'destructive' })
      return
    }
    if (schedule.length === 0) {
      toast({
        title: 'Nothing to save',
        description: 'Check the amount and that the end date is after the start date.',
        variant: 'destructive',
      })
      return
    }

    const config = { ...form, name: form.name.trim() } as unknown as Record<string, unknown>
    try {
      if (initial) {
        await updateMutation.mutateAsync({
          analysisId: initial.id,
          data: { name: form.name.trim(), client_id: clientId, config, data: schedule, results: journalEntries },
        })
        toast({ title: 'Schedule updated', description: `${form.name} has been saved.` })
      } else {
        await createMutation.mutateAsync({
          type: 'waterfall',
          name: form.name.trim(),
          client_id: clientId,
          status: 'draft',
          config,
          data: schedule,
          results: journalEntries,
        })
        toast({ title: 'Schedule saved', description: `${form.name} has been created.` })
      }
      onDone()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save schedule.',
        variant: 'destructive',
      })
    }
  }

  const isPrepaid = form.type === 'Prepaid Expenses'
  const isAccrued = form.type === 'Accrued Expenses'
  const isCommission = form.type === 'Deferred Commission'
  const isDeferred = form.type === 'Deferred Revenue'

  const hint = (key: string) => {
    const score = confidence[key]
    if (score == null) return null
    return (
      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
        <Sparkles className="size-2.5" aria-hidden /> {Math.round(score)}%
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onDone}>
          <ArrowLeft className="mr-1.5 size-4" aria-hidden /> Back to schedules
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
          {initial ? 'Save changes' : 'Save schedule'}
        </Button>
      </div>

      {/* Contract extraction */}
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium text-foreground">Prefill from a contract</p>
          <p className="text-foreground-muted">
            Upload a PDF, Word, or text document and AI will extract the key fields.
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
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={extracting}
        >
          {extracting ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <FileUp className="mr-2 size-4" aria-hidden />
          )}
          {extracting ? 'Extracting…' : 'Upload contract'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: details + accounts */}
        <div className="space-y-6">
          <div className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Details</h3>

            <div className="space-y-1.5">
              <Label htmlFor="wf-type">Type</Label>
              <Select value={form.type} onValueChange={(v) => handleSubtype(v as WaterfallSubtype)}>
                <SelectTrigger id="wf-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WATERFALL_SUBTYPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-name">
                Name {hint('name')}
              </Label>
              <Input
                id="wf-name"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Acme Corp — Annual SaaS License 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-party">
                {isPrepaid || isAccrued ? 'Vendor / Counterparty' : 'Party'} {hint('partyName')}
              </Label>
              <Input
                id="wf-party"
                value={form.partyName}
                onChange={(e) => set({ partyName: e.target.value })}
                placeholder="Acme Corp"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-client">Client (optional)</Label>
              <Select
                value={clientId ?? NO_CLIENT}
                onValueChange={(v) => setClientId(v === NO_CLIENT ? null : v)}
              >
                <SelectTrigger id="wf-client">
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
              <Label htmlFor="wf-amount">
                Total amount {hint('totalAmount')}
              </Label>
              <Input
                id="wf-amount"
                type="number"
                value={Number.isNaN(form.totalAmount) ? '' : form.totalAmount}
                onChange={(e) => set({ totalAmount: parseFloat(e.target.value) })}
                placeholder="120000"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="wf-start">
                  Start date {hint('startDate')}
                </Label>
                <Input
                  id="wf-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set({ startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wf-end">
                  End date {hint('endDate')}
                </Label>
                <Input
                  id="wf-end"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set({ endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wf-method">Recognition method</Label>
              <Select
                value={form.recognitionMethod}
                onValueChange={(v) => set({ recognitionMethod: v as WaterfallFormState['recognitionMethod'] })}
              >
                <SelectTrigger id="wf-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECOGNITION_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(isPrepaid || isAccrued) && (
              <div className="space-y-1.5">
                <Label htmlFor="wf-category">Expense category</Label>
                <Input
                  id="wf-category"
                  value={form.expenseCategory}
                  onChange={(e) => set({ expenseCategory: e.target.value })}
                  placeholder="Insurance"
                />
              </div>
            )}

            {(isPrepaid || isCommission) && (
              <div className="space-y-1.5">
                <Label htmlFor="wf-payment">Payment date</Label>
                <Input
                  id="wf-payment"
                  type="date"
                  value={form.paymentDate}
                  onChange={(e) => set({ paymentDate: e.target.value })}
                />
              </div>
            )}

            {isAccrued && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="wf-expected">Expected payment / settlement date</Label>
                  <Input
                    id="wf-expected"
                    type="date"
                    value={form.expectedPaymentDate}
                    onChange={(e) => set({ expectedPaymentDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wf-reversal">Reversal method</Label>
                  <Select
                    value={form.reversalMethod}
                    onValueChange={(v) => set({ reversalMethod: v })}
                  >
                    <SelectTrigger id="wf-reversal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Reverse on Payment Date">Reverse on Payment Date</SelectItem>
                      <SelectItem value="Auto-Reverse Next Period">Auto-Reverse Next Period</SelectItem>
                      <SelectItem value="No Reversal">No Reversal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {isCommission && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="wf-commtype">Commission type</Label>
                  <Select
                    value={form.commissionType}
                    onValueChange={(v) => set({ commissionType: v })}
                  >
                    <SelectTrigger id="wf-commtype">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Initial Sale">Initial Sale</SelectItem>
                      <SelectItem value="Renewal">Renewal</SelectItem>
                      <SelectItem value="Upsell/Expansion">Upsell/Expansion</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wf-benefit">Benefit period method</Label>
                  <Select
                    value={form.benefitPeriodMethod}
                    onValueChange={(v) => set({ benefitPeriodMethod: v })}
                  >
                    <SelectTrigger id="wf-benefit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Contract Term">Contract Term</SelectItem>
                      <SelectItem value="Expected Customer Life">Expected Customer Life</SelectItem>
                      <SelectItem value="Portfolio Average">Portfolio Average</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {/* Accounts */}
          <div className="space-y-4 rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Journal accounts</h3>
            {isDeferred && (
              <>
                <AccountField label="Deferred revenue account" value={form.deferredAccount} onChange={(v) => set({ deferredAccount: v })} />
                <AccountField label="Revenue account" value={form.revenueAccount} onChange={(v) => set({ revenueAccount: v })} />
              </>
            )}
            {isPrepaid && (
              <>
                <AccountField label="Prepaid account" value={form.prepaidAccount} onChange={(v) => set({ prepaidAccount: v })} />
                <AccountField label="Expense account" value={form.expenseAccount} onChange={(v) => set({ expenseAccount: v })} />
              </>
            )}
            {isAccrued && (
              <>
                <AccountField label="Liability account" value={form.liabilityAccount} onChange={(v) => set({ liabilityAccount: v })} />
                <AccountField label="Expense account" value={form.expenseAccount} onChange={(v) => set({ expenseAccount: v })} />
              </>
            )}
            {isCommission && (
              <>
                <AccountField label="Deferred commission account" value={form.defCommAccount} onChange={(v) => set({ defCommAccount: v })} />
                <AccountField label="Commission expense account" value={form.commExpenseAccount} onChange={(v) => set({ commExpenseAccount: v })} />
              </>
            )}
          </div>
        </div>

        {/* Right: results */}
        <div className="rounded-lg border border-border bg-card p-5">
          <Tabs defaultValue="schedule">
            <TabsList>
              <TabsTrigger value="schedule">Schedule ({schedule.length})</TabsTrigger>
              <TabsTrigger value="journal">Journal entries ({journalEntries.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="schedule" className="mt-4">
              <WaterfallScheduleTable schedule={schedule} />
            </TabsContent>
            <TabsContent value="journal" className="mt-4">
              <WaterfallJournalTable journalEntries={journalEntries} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

function AccountField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export default WaterfallForm

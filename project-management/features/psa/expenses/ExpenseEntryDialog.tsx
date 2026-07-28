'use client'

/** Expense entry dialog with receipt upload and OCR stub. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'
import { useExpensesStore, useAttachmentsStore } from '../../../stores/entities'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'
import { getFileStorageAdapter } from '../../../lib/fileStorage'
import { getOcrAdapter } from '../../../lib/ocr'
import { EXPENSE_CATEGORY_LABELS, DEFAULT_MILEAGE_RATE } from '../../../lib/psa/constants'
import { computeBillableAmount, defaultPassThrough, expenseTotals, mileageAmount } from '../../../lib/psa/expenseUtils'
import { formatMoney } from '../../../lib/billing/formatMoney'
import type { Expense, ExpenseCategory, Task } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  userId: string
  task?: Task
  projectId?: string
  matterId?: string
  clientId?: string
  mileageMode?: boolean
  mileageRate?: number
}

export function ExpenseEntryDialog(props: Props) {
  const add = useExpensesStore((s) => s.add)
  const addAttachment = useAttachmentsStore((s) => s.add)
  const [description, setDescription] = useState('')
  const [vendor, setVendor] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>(props.mileageMode ? 'mileage' : 'other')
  const [amount, setAmount] = useState('')
  const [taxAmount, setTaxAmount] = useState('0')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [billable, setBillable] = useState(true)
  const [passThrough, setPassThrough] = useState(defaultPassThrough(category))
  const [markup, setMarkup] = useState('0')
  const [reimbursable, setReimbursable] = useState(false)
  const [miles, setMiles] = useState('')
  const [ocrHint, setOcrHint] = useState('')
  const [loading, setLoading] = useState(false)

  const rate = props.mileageRate ?? DEFAULT_MILEAGE_RATE
  const baseAmount = props.mileageMode ? mileageAmount(parseFloat(miles) || 0, rate) : parseFloat(amount) || 0
  const tax = parseFloat(taxAmount) || 0
  const { totalAmount } = expenseTotals(baseAmount, tax)
  const billableAmount = computeBillableAmount(totalAmount, billable, passThrough, parseFloat(markup) || 0)

  const onReceipt = async (file: File) => {
    const ocr = getOcrAdapter()
    const result = await ocr.scanReceipt(file)
    if (!ocr.configured) setOcrHint('OCR provider not configured — enter amounts manually.')
    if (result.vendor) setVendor(result.vendor)
    if (result.date) setDate(result.date)
    if (result.amount) setAmount(String(result.amount))
    if (result.taxAmount) setTaxAmount(String(result.taxAmount))
    const storage = getFileStorageAdapter()
    const uploaded = await storage.upload({ file, ownerId: props.userId, scope: 'task', scopeId: props.task?.id ?? props.projectId ?? props.workspaceId })
    await addAttachment({ id: newId(), name: file.name, size: file.size, mime: file.type, dataUrl: uploaded.dataUrl, storage: uploaded.storage, storageRef: uploaded.ref, uploadedBy: props.userId, taskId: props.task?.id, createdAt: now() })
  }

  const submit = async () => {
    if (!description.trim() || totalAmount <= 0) return
    setLoading(true)
    try {
      const expense: Expense = {
        id: newId(),
        workspaceId: props.workspaceId,
        userId: props.userId,
        taskId: props.task?.id,
        projectId: props.projectId ?? props.task?.projectIds[0],
        matterId: props.matterId,
        clientId: props.clientId,
        description: description.trim(),
        vendor: vendor || undefined,
        amount: baseAmount,
        category,
        date,
        billable,
        taxAmount: tax,
        totalAmount,
        currency: 'USD',
        passThrough,
        markupPercent: parseFloat(markup) || 0,
        billableAmount,
        reimbursable,
        mileageMiles: props.mileageMode ? parseFloat(miles) : undefined,
        mileageRate: props.mileageMode ? rate : undefined,
        paymentMethod: reimbursable ? 'personal' : 'corporate_card',
        status: 'draft',
        approved: false,
        invoiced: false,
        createdAt: now(),
        modifiedAt: now(),
      }
      await add(expense)
      props.onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <TasklyticDialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-serif text-xl">{props.mileageMode ? 'Mileage' : 'Add expense'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          {props.mileageMode ? (
            <div className="grid gap-1"><Label>Miles</Label><Input value={miles} onChange={(e) => setMiles(e.target.value)} className="tl-input font-mono tabular-nums" /><p className="text-xs font-mono tabular-nums" style={{ color: 'var(--ink-muted)' }}>@ {formatMoney(rate)}/mi = {formatMoney(baseAmount)}</p></div>
          ) : (
            <>
              <Input type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onReceipt(f) }} />
              {ocrHint && <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{ocrHint}</p>}
              <Input placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="tl-input font-mono tabular-nums" />
              <Input placeholder="Tax" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="tl-input font-mono tabular-nums" />
            </>
          )}
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="tl-input" />
          <Input placeholder="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} className="tl-input" />
          <Select value={category} onValueChange={(v) => { setCategory(v as ExpenseCategory); setPassThrough(defaultPassThrough(v)) }}>
            <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">{Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="tl-input" />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm"><Switch checked={billable} onCheckedChange={setBillable} /> Billable</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={passThrough} onCheckedChange={setPassThrough} /> Pass-through</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={reimbursable} onCheckedChange={setReimbursable} /> Reimbursable</label>
          </div>
          {!passThrough && <Input placeholder="Markup %" value={markup} onChange={(e) => setMarkup(e.target.value)} className="tl-input font-mono tabular-nums" />}
          <p className="text-right font-mono tabular-nums text-sm">Billable: {formatMoney(billableAmount)}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}

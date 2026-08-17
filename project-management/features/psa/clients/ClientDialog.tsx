'use client'

/** Client create/edit dialog. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DialogContent, Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useClientsStore, useRateCardsStore } from '../../../stores/entities'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'
import type { Client } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  client?: Client
}

export function ClientDialog({ open, onOpenChange, workspaceId, client }: Props) {
  const add = useClientsStore((s) => s.add)
  const update = useClientsStore((s) => s.update)
  const rateCards = useRateCardsStore((s) => s.list().filter((card) => card.workspaceId === workspaceId))
  const [name, setName] = useState(client?.name ?? '')
  const [type, setType] = useState<Client['type']>(client?.type ?? 'business')
  const [email, setEmail] = useState(client?.contactEmail ?? '')
  const [contactName, setContactName] = useState(client?.contactName ?? '')
  const [contactPhone, setContactPhone] = useState(client?.contactPhone ?? '')
  const [billingAddress, setBillingAddress] = useState(client?.billingAddress ?? '')
  const [taxId, setTaxId] = useState(client?.taxId ?? '')
  const [terms, setTerms] = useState<Client['paymentTerms']>(client?.paymentTerms ?? 'net_30')
  const [rateCardId, setRateCardId] = useState(client?.defaultRateCardId ?? 'none')
  const [currency, setCurrency] = useState(client?.defaultCurrency ?? 'USD')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      if (client) {
        await update(client.id, { name: name.trim(), type, contactName: contactName || undefined, contactEmail: email || undefined, contactPhone: contactPhone || undefined, billingAddress: billingAddress || undefined, taxId: taxId || undefined, paymentTerms: terms, defaultRateCardId: rateCardId === 'none' ? undefined : rateCardId, defaultCurrency: currency.toUpperCase() })
      } else {
        await add({
          id: newId(),
          workspaceId,
          name: name.trim(),
          type,
          contactName: contactName || undefined,
          contactEmail: email || undefined,
          contactPhone: contactPhone || undefined,
          billingAddress: billingAddress || undefined,
          taxId: taxId || undefined,
          paymentTerms: terms,
          defaultCurrency: currency.toUpperCase(),
          defaultRateCardId: rateCardId === 'none' ? undefined : rateCardId,
          archived: false,
          createdAt: now(),
        })
      }
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle className="font-sans text-xl">{client ? 'Edit client' : 'New client'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-input bg-background text-foreground" /></div>
          <Select value={type} onValueChange={(v) => setType(v as Client['type'])}>
            <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[100]">{(['individual', 'business', 'nonprofit', 'government'] as const).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>Billing contact name</Label><Input maxLength={200} value={contactName} onChange={(e) => setContactName(e.target.value)} /></div><div><Label>Contact email</Label><Input maxLength={320} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div></div>
          <div className="grid gap-3 sm:grid-cols-2"><div><Label>Contact phone</Label><Input maxLength={100} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div><div><Label>Tax ID</Label><Input maxLength={200} value={taxId} onChange={(e) => setTaxId(e.target.value)} /></div></div>
          <div><Label>Billing address</Label><Textarea maxLength={1000} value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} /></div>
          <Select value={terms} onValueChange={(v) => setTerms(v as Client['paymentTerms'])}>
            <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[100]">{(['due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60'] as const).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={rateCardId} onValueChange={setRateCardId}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Default rate card" /></SelectTrigger><SelectContent className="z-[100]"><SelectItem value="none">No default rate card</SelectItem>{rateCards.map((card) => <SelectItem value={card.id} key={card.id}>{card.name}</SelectItem>)}</SelectContent></Select>
          <div><Label>Billing currency</Label><Input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value)} className="rounded-md border border-input bg-background text-foreground uppercase" /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

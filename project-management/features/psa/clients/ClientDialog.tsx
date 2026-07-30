'use client'

/** Client create/edit dialog. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'
import { useClientsStore } from '../../../stores/entities'
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
  const [name, setName] = useState(client?.name ?? '')
  const [type, setType] = useState<Client['type']>(client?.type ?? 'business')
  const [email, setEmail] = useState(client?.contactEmail ?? '')
  const [terms, setTerms] = useState<Client['paymentTerms']>(client?.paymentTerms ?? 'net_30')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setLoading(true)
    try {
      if (client) {
        await update(client.id, { name: name.trim(), type, contactEmail: email, paymentTerms: terms })
      } else {
        await add({
          id: newId(),
          workspaceId,
          name: name.trim(),
          type,
          contactEmail: email || undefined,
          paymentTerms: terms,
          defaultCurrency: 'USD',
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
      <TasklyticDialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-serif text-xl">{client ? 'Edit client' : 'New client'}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="tl-input" /></div>
          <Select value={type} onValueChange={(v) => setType(v as Client['type'])}>
            <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">{(['individual', 'business', 'nonprofit', 'government'] as const).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <div><Label>Contact email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} className="tl-input" /></div>
          <Select value={terms} onValueChange={(v) => setTerms(v as Client['paymentTerms'])}>
            <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">{(['due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60'] as const).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}

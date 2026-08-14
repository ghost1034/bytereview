'use client'

/** Matter create dialog — links project + client. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DialogContent, Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useClientsStore, useMattersStore, useProjectsStore, useRateCardsStore, useTeamsStore, useWorkspacesStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'
import { matterTerminology } from '../../../lib/psa/terminology'

type Props = { open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; teamId?: string }

export function MatterDialog({ open, onOpenChange, workspaceId, teamId }: Props) {
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const terms = matterTerminology(workspace)
  const addMatter = useMattersStore((s) => s.add)
  const addProject = useProjectsStore((s) => s.add)
  const clients = useClientsStore((s) => s.list().filter((c) => c.workspaceId === workspaceId && !c.archived))
  const teams = useTeamsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const rateCards = useRateCardsStore((s) => s.list().filter((card) => card.workspaceId === workspaceId))
  const userId = useAuthStore((s) => s.currentUserId)
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [matterNumber, setMatterNumber] = useState('')
  const [practiceArea, setPracticeArea] = useState('')
  const [utbms, setUtbms] = useState(true)
  const [trust, setTrust] = useState(false)
  const [rateCardId, setRateCardId] = useState('none')
  const [budgetHours, setBudgetHours] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!name.trim() || !clientId || !userId) return
    setLoading(true)
    try {
      const projectId = newId()
      const tid = teamId ?? teams[0]?.id
      if (!tid) return
      const ts = now()
      await addProject({
        id: projectId,
        workspaceId,
        teamId: tid,
        name: name.trim(),
        color: '#6B5B4F',
        privacy: 'public_to_team',
        memberIds: [userId],
        ownerId: userId,
        defaultView: 'list',
        enabledViews: ['list', 'board'],
        status: 'on_track',
        archived: false,
        isTemplate: false,
        customFieldIds: [],
        sectionIds: [],
        clientId,
        matterId: projectId,
        useUtbms: utbms,
        trustEnabled: trust,
        requireTimeTracking: true,
        createdAt: ts,
        modifiedAt: ts,
      })
      await addMatter({
        id: projectId,
        workspaceId,
        projectId,
        clientId,
        matterNumber: matterNumber || `M-${Date.now().toString().slice(-6)}`,
        practiceArea: practiceArea || 'General',
        responsibleAttorneyId: userId,
        originatingAttorneyId: userId,
        feeArrangement: 'hourly',
        rateCardId: rateCardId === 'none' ? undefined : rateCardId,
        budgetHours: Number(budgetHours) || undefined,
        budgetAmount: Number(budgetAmount) || undefined,
        utbmsEnabled: utbms,
        trustEnabled: trust,
        openedAt: ts.slice(0, 10),
        status: 'active',
        conflictStatus: 'cleared',
      })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-sans text-xl">New {terms.singular.toLowerCase()}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label>{terms.singular} name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-input bg-background text-foreground" /></div>
          <div><Label>{terms.singular} number</Label><Input value={matterNumber} onChange={(e) => setMatterNumber(e.target.value)} className="rounded-md border border-input bg-background text-foreground" /></div>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent className="z-[100]">{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Practice area" value={practiceArea} onChange={(e) => setPracticeArea(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          <Select value={rateCardId} onValueChange={setRateCardId}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Rate card" /></SelectTrigger><SelectContent className="z-[100]"><SelectItem value="none">Client / workspace default</SelectItem>{rateCards.map((card) => <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>)}</SelectContent></Select>
          <div className="grid grid-cols-2 gap-2"><Input placeholder="Budget hours" value={budgetHours} onChange={(event) => setBudgetHours(event.target.value)} /><Input placeholder="Budget amount" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={utbms} onCheckedChange={setUtbms} /> UTBMS codes</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={trust} onCheckedChange={setTrust} /> Trust accounting</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading} onClick={() => void submit()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

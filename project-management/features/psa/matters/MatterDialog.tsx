'use client'

/** Matter create dialog — links project + client. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TasklyticDialogContent } from '../../shell/TasklyticDialogContent'
import { useClientsStore, useMattersStore, useProjectsStore, useTeamsStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'

type Props = { open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; teamId?: string }

export function MatterDialog({ open, onOpenChange, workspaceId, teamId }: Props) {
  const addMatter = useMattersStore((s) => s.add)
  const addProject = useProjectsStore((s) => s.add)
  const clients = useClientsStore((s) => s.list().filter((c) => c.workspaceId === workspaceId && !c.archived))
  const teams = useTeamsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const userId = useAuthStore((s) => s.currentUserId)
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [matterNumber, setMatterNumber] = useState('')
  const [practiceArea, setPracticeArea] = useState('')
  const [utbms, setUtbms] = useState(true)
  const [trust, setTrust] = useState(false)
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
      <TasklyticDialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-serif text-xl">New matter</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label>Matter name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="tl-input" /></div>
          <div><Label>Matter number</Label><Input value={matterNumber} onChange={(e) => setMatterNumber(e.target.value)} className="tl-input" /></div>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="tl-input"><SelectValue placeholder="Client" /></SelectTrigger>
            <SelectContent className="tl-popover-surface z-[100]">{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Practice area" value={practiceArea} onChange={(e) => setPracticeArea(e.target.value)} className="tl-input" />
          <label className="flex items-center gap-2 text-sm"><Switch checked={utbms} onCheckedChange={setUtbms} /> UTBMS codes</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={trust} onCheckedChange={setTrust} /> Trust accounting</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={loading} onClick={() => void submit()}>Create</Button>
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}

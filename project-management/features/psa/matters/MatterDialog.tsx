'use client'

/** Matter create/edit dialog — links project, client, ownership, and billing settings. */
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DialogContent, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/hooks/use-toast'
import { useClientsStore, useMattersStore, useProjectsStore, useRateCardsStore, useTeamsStore, useUsersStore, useWorkspacesStore } from '../../../stores/entities'
import { useAuthStore } from '../../../stores/auth'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'
import { matterTerminology } from '../../../lib/psa/terminology'
import {
  availableMatterProjects,
  matchingMatterProjects,
  updateForMatterLink,
  type MatterProjectMode,
} from '../../../lib/psa/matterProjectLink'
import type { Matter } from '../../../types'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  workspaceId: string
  teamId?: string
  matter?: Matter
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function MatterDialog({ open, onOpenChange, workspaceId, teamId, matter }: Props) {
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))
  const terms = matterTerminology(workspace)
  const project = useProjectsStore((s) => matter ? s.getById(matter.projectId) : undefined)
  const projects = useProjectsStore((s) => s.list())
  const matters = useMattersStore((s) => s.list().filter((candidate) => candidate.workspaceId === workspaceId))
  const addMatter = useMattersStore((s) => s.add)
  const updateMatter = useMattersStore((s) => s.update)
  const addProject = useProjectsStore((s) => s.add)
  const updateProject = useProjectsStore((s) => s.update)
  const clients = useClientsStore((s) => s.list().filter((client) => client.workspaceId === workspaceId && (!client.archived || client.id === matter?.clientId)))
  const teams = useTeamsStore((s) => s.list().filter((team) => team.workspaceId === workspaceId))
  const users = useUsersStore((s) => s.list().filter((user) => workspace?.memberIds.includes(user.id)))
  const rateCards = useRateCardsStore((s) => s.list().filter((card) => card.workspaceId === workspaceId))
  const userId = useAuthStore((s) => s.currentUserId)
  const { toast } = useToast()
  const [name, setName] = useState(project?.name ?? '')
  const [clientId, setClientId] = useState(matter?.clientId ?? '')
  const [projectMode, setProjectMode] = useState<MatterProjectMode>('create')
  const [existingProjectId, setExistingProjectId] = useState('')
  const [matterNumber, setMatterNumber] = useState(matter?.matterNumber ?? '')
  const [practiceArea, setPracticeArea] = useState(matter?.practiceArea ?? '')
  const [responsibleOwnerId, setResponsibleOwnerId] = useState(matter?.responsibleAttorneyId ?? userId ?? '')
  const [originatingOwnerId, setOriginatingOwnerId] = useState(matter?.originatingAttorneyId ?? userId ?? '')
  const [status, setStatus] = useState<Matter['status']>(matter?.status ?? 'active')
  const [feeArrangement, setFeeArrangement] = useState<Matter['feeArrangement']>(matter?.feeArrangement ?? 'hourly')
  const [utbms, setUtbms] = useState(matter?.utbmsEnabled ?? true)
  const [trust, setTrust] = useState(matter?.trustEnabled ?? false)
  const [rateCardId, setRateCardId] = useState(matter?.rateCardId ?? 'none')
  const [budgetHours, setBudgetHours] = useState(matter?.budgetHours?.toString() ?? '')
  const [budgetAmount, setBudgetAmount] = useState(matter?.budgetAmount?.toString() ?? '')
  const [flatFeeAmount, setFlatFeeAmount] = useState(matter?.flatFeeAmount?.toString() ?? '')
  const [contingencyPercent, setContingencyPercent] = useState(matter?.contingencyPercent?.toString() ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const availableProjects = useMemo(
    () => availableMatterProjects(projects, matters, workspaceId),
    [projects, matters, workspaceId],
  )
  const matchingProjects = useMemo(
    () => matchingMatterProjects(availableProjects, name),
    [availableProjects, name],
  )
  const selectedProject = availableProjects.find((candidate) => candidate.id === existingProjectId)

  const chooseExistingProject = (projectId: string) => {
    const nextProject = availableProjects.find((candidate) => candidate.id === projectId)
    setExistingProjectId(projectId)
    setProjectMode('existing')
    if (nextProject?.clientId) setClientId(nextProject.clientId)
  }

  const submit = async () => {
    const linkedProjectName = projectMode === 'existing' && !matter ? selectedProject?.name ?? '' : name.trim()
    if (loading || !linkedProjectName || !clientId || !responsibleOwnerId || !originatingOwnerId) return
    setLoading(true)
    setError('')
    try {
      const matterPatch = {
        clientId,
        matterNumber: matterNumber.trim() || `M-${Date.now().toString().slice(-6)}`,
        practiceArea: practiceArea.trim() || 'General',
        responsibleAttorneyId: responsibleOwnerId,
        originatingAttorneyId: originatingOwnerId,
        feeArrangement,
        flatFeeAmount: feeArrangement === 'flat_fee' || feeArrangement === 'hybrid' ? optionalNumber(flatFeeAmount) : undefined,
        contingencyPercent: feeArrangement === 'contingency' || feeArrangement === 'hybrid' ? optionalNumber(contingencyPercent) : undefined,
        rateCardId: rateCardId === 'none' ? undefined : rateCardId,
        budgetHours: optionalNumber(budgetHours),
        budgetAmount: optionalNumber(budgetAmount),
        utbmsEnabled: utbms,
        trustEnabled: trust,
        status,
      }

      if (matter) {
        await updateMatter(matter.id, matterPatch)
        await updateProject(matter.projectId, {
          name: name.trim(),
          clientId,
          ownerId: responsibleOwnerId,
          feeArrangement,
          rateCardId: matterPatch.rateCardId,
          budgetHours: matterPatch.budgetHours,
          budgetAmount: matterPatch.budgetAmount,
          useUtbms: utbms,
          trustEnabled: trust,
          modifiedAt: now(),
        })
      } else {
        const tid = teamId ?? teams[0]?.id
        if (projectMode === 'create' && !tid) return
        if (!userId) return
        const matterId = newId()
        const projectId = projectMode === 'create' ? newId() : selectedProject?.id
        if (!projectId) return
        const ts = now()
        if (projectMode === 'create') {
          await addProject({
            id: projectId,
            workspaceId,
            teamId: tid!,
            name: name.trim(),
            color: '#6B5B4F',
            privacy: 'public_to_team',
            memberIds: [userId],
            ownerId: responsibleOwnerId,
            defaultView: 'list',
            enabledViews: ['list', 'board'],
            status: 'on_track',
            archived: false,
            isTemplate: false,
            customFieldIds: [],
            sectionIds: [],
            clientId,
            matterId,
            feeArrangement,
            rateCardId: matterPatch.rateCardId,
            budgetHours: matterPatch.budgetHours,
            budgetAmount: matterPatch.budgetAmount,
            useUtbms: utbms,
            trustEnabled: trust,
            requireTimeTracking: true,
            createdAt: ts,
            modifiedAt: ts,
          })
        }
        await addMatter({
          id: matterId,
          workspaceId,
          projectId,
          ...matterPatch,
          openedAt: ts.slice(0, 10),
          conflictStatus: 'cleared',
        })
        if (projectMode === 'existing' && selectedProject) {
          await updateProject(projectId, updateForMatterLink(selectedProject, {
            clientId,
            matterId,
            ownerId: responsibleOwnerId,
            feeArrangement,
            rateCardId: matterPatch.rateCardId,
            budgetHours: matterPatch.budgetHours,
            budgetAmount: matterPatch.budgetAmount,
            useUtbms: utbms,
            trustEnabled: trust,
            modifiedAt: ts,
          }))
        }
        toast({
          title: `${terms.singular} created`,
          description: `Linked project: ${linkedProjectName}`,
          className: 'tl-toast border-l-4',
          style: { borderLeftColor: 'hsl(var(--success))' },
        })
      }
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Unable to save ${terms.singular.toLowerCase()}.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">{matter ? `Edit ${terms.singular.toLowerCase()}` : `New ${terms.singular.toLowerCase()}`}</DialogTitle>
          <DialogDescription>
            {matter
              ? `Update the ${terms.singular.toLowerCase()} and its linked project settings.`
              : `Every ${terms.singular.toLowerCase()} is linked to a project. Create one or attach an active project that already exists.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2 sm:grid-cols-2">
          {!matter && (
            <div className="grid gap-2 sm:col-span-2">
              <Label>Linked project</Label>
              <RadioGroup value={projectMode} onValueChange={(value) => setProjectMode(value as MatterProjectMode)} className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm">
                  <RadioGroupItem value="create" />
                  Create linked project
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-3 text-sm">
                  <RadioGroupItem value="existing" />
                  Link existing project
                </label>
              </RadioGroup>
            </div>
          )}
          {(matter || projectMode === 'create') ? (
            <div>
              <Label>{terms.singular} {matter ? 'name' : 'and project name'}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} className="rounded-md border border-input bg-background text-foreground" />
              {!matter && matchingProjects.length > 0 && (
                <div className="mt-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning" role="alert">
                  <p>A project named “{matchingProjects[0].name}” already exists. Link it to avoid creating a duplicate.</p>
                  <Button type="button" variant="link" className="h-auto p-0 text-warning underline" onClick={() => chooseExistingProject(matchingProjects[0].id)}>Link existing project</Button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Label>Project to link</Label>
              <Select value={existingProjectId} onValueChange={chooseExistingProject}>
                <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Select an active project" /></SelectTrigger>
                <SelectContent className="z-[100]">
                  {availableProjects.map((candidate) => {
                    const projectClient = clients.find((client) => client.id === candidate.clientId)
                    return <SelectItem key={candidate.id} value={candidate.id}>{candidate.name} · {projectClient?.name ?? 'No client'} · {candidate.id.slice(0, 8)}</SelectItem>
                  })}
                </SelectContent>
              </Select>
              {!availableProjects.length && <p className="mt-2 text-sm text-foreground-muted">There are no active, unlinked projects in this workspace.</p>}
              {selectedProject && <p className="mt-2 rounded-md bg-muted p-2 text-sm">Linked project: <span className="font-medium">{selectedProject.name}</span></p>}
            </div>
          )}
          <div><Label>{terms.singular} number</Label><Input value={matterNumber} onChange={(event) => setMatterNumber(event.target.value)} className="rounded-md border border-input bg-background text-foreground" /></div>
          <div><Label>Client</Label><Select value={clientId} onValueChange={setClientId}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Select client" /></SelectTrigger><SelectContent className="z-[100]">{clients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Practice area</Label><Input value={practiceArea} onChange={(event) => setPracticeArea(event.target.value)} className="rounded-md border border-input bg-background text-foreground" /></div>
          <div><Label>Responsible owner</Label><Select value={responsibleOwnerId} onValueChange={setResponsibleOwnerId}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Select owner" /></SelectTrigger><SelectContent className="z-[100]">{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Originating owner</Label><Select value={originatingOwnerId} onValueChange={setOriginatingOwnerId}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Select owner" /></SelectTrigger><SelectContent className="z-[100]">{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Status</Label><Select value={status} onValueChange={(value) => setStatus(value as Matter['status'])}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue /></SelectTrigger><SelectContent className="z-[100]">{(['active', 'on_hold', 'closed', 'collections'] as const).map((value) => <SelectItem key={value} value={value}>{value.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Fee arrangement</Label><Select value={feeArrangement} onValueChange={(value) => setFeeArrangement(value as Matter['feeArrangement'])}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue /></SelectTrigger><SelectContent className="z-[100]">{(['hourly', 'flat_fee', 'contingency', 'hybrid', 'retainer'] as const).map((value) => <SelectItem key={value} value={value}>{value.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Rate card</Label><Select value={rateCardId} onValueChange={setRateCardId}><SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue /></SelectTrigger><SelectContent className="z-[100]"><SelectItem value="none">Client / workspace default</SelectItem>{rateCards.map((card) => <SelectItem key={card.id} value={card.id}>{card.name}</SelectItem>)}</SelectContent></Select></div>
          {(feeArrangement === 'flat_fee' || feeArrangement === 'hybrid') && <div><Label>Flat fee amount</Label><Input type="number" min="0" value={flatFeeAmount} onChange={(event) => setFlatFeeAmount(event.target.value)} /></div>}
          {(feeArrangement === 'contingency' || feeArrangement === 'hybrid') && <div><Label>Contingency percent</Label><Input type="number" min="0" max="100" value={contingencyPercent} onChange={(event) => setContingencyPercent(event.target.value)} /></div>}
          <div><Label>Budget hours</Label><Input type="number" min="0" value={budgetHours} onChange={(event) => setBudgetHours(event.target.value)} /></div>
          <div><Label>Budget amount</Label><Input type="number" min="0" value={budgetAmount} onChange={(event) => setBudgetAmount(event.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={utbms} onCheckedChange={setUtbms} /> UTBMS codes</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={trust} onCheckedChange={setTrust} /> Trust accounting</label>
          {error && <p className="text-sm text-destructive sm:col-span-2" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="border-0"
            disabled={loading || !(matter || projectMode === 'create' ? name.trim() : existingProjectId) || !clientId || !responsibleOwnerId || !originatingOwnerId || (!matter && projectMode === 'create' && !(teamId ?? teams[0]?.id))}
            onClick={() => void submit()}
          >
            {loading ? 'Saving…' : matter ? 'Save changes' : `Create ${terms.singular.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

/** CreateOrEditPortfolioModal — create or edit a portfolio with projects and goals. */
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { updatePortfolio } from '../../lib/portfolios/portfolioActions'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { useAuthStore } from '../../stores/auth'
import {
  useGoalsStore,
  usePortfoliosStore,
  useProjectsStore,
  useUsersStore,
} from '../../stores/entities'
import { ProjectColorPicker } from '../projects/ProjectColorPicker'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  portfolio?: EnrichedPortfolio
}

export function CreateOrEditPortfolioModal({ open, onOpenChange, workspaceId, portfolio }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const addPortfolio = usePortfoliosStore((s) => s.add)
  const users = useUsersStore((s) => s.list())
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const goals = useGoalsStore((s) => s.list().filter((g) => g.workspaceId === workspaceId))
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [iconEmoji, setIconEmoji] = useState('📊')
  const [color, setColor] = useState('primary')
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [goalIds, setGoalIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const editing = Boolean(portfolio)

  useEffect(() => {
    if (!open) return
    if (portfolio) {
      setName(portfolio.name)
      setDescription(portfolio.description ?? '')
      setOwnerId(portfolio.ownerId)
      setIconEmoji(portfolio.iconEmoji ?? '📊')
      setColor(portfolio.color ?? 'primary')
      setProjectIds([...portfolio.projectIds])
      setGoalIds([...portfolio.goalIds])
    } else {
      setName('')
      setDescription('')
      setOwnerId(currentUserId ?? '')
      setIconEmoji('📊')
      setColor('primary')
      setProjectIds([])
      setGoalIds([])
    }
  }, [open, portfolio, currentUserId])

  const toggle = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  }

  const submit = async () => {
    if (!currentUserId || !name.trim() || !ownerId) return
    setLoading(true)
    try {
      if (portfolio) {
        await updatePortfolio(portfolio.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          ownerId,
          iconEmoji,
          color,
          projectIds,
          goalIds,
        })
      } else {
        const row: EnrichedPortfolio = {
          id: newId(),
          workspaceId,
          name: name.trim(),
          description: description.trim() || undefined,
          ownerId,
          iconEmoji,
          color,
          projectIds,
          goalIds,
          customFieldIds: [],
          status: 'on_track',
          createdAt: now(),
        }
        await addPortfolio(row)
      }
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">
            {editing ? 'Edit portfolio' : 'New portfolio'}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="portfolio-name">Name</Label>
            <Input id="portfolio-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="portfolio-desc">Description</Label>
            <Input id="portfolio-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="portfolio-icon">Icon</Label>
              <Input id="portfolio-icon" value={iconEmoji} onChange={(e) => setIconEmoji(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
            </div>
            <div className="grid gap-2">
              <Label>Color</Label>
              <ProjectColorPicker value={color} onChange={setColor} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="rounded-md border border-input bg-background text-foreground"><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent className="z-[100]">
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {projects.length > 0 && (
            <div className="grid gap-2">
              <Label>Projects</Label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
                {projects.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={projectIds.includes(p.id)} onChange={() => toggle(projectIds, p.id, setProjectIds)} />
                    <span>{p.iconEmoji ?? '📁'} {p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {goals.length > 0 && (
            <div className="grid gap-2">
              <Label>Goals</Label>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
                {goals.map((g) => (
                  <label key={g.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={goalIds.includes(g.id)} onChange={() => toggle(goalIds, g.id, setGoalIds)} />
                    <span>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className=" border-0" disabled={loading || !name.trim()} onClick={() => void submit()}>
            {editing ? 'Save changes' : 'Create portfolio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

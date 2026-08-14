'use client'

/** PortfolioAddProjectsDialog — multi-select picker and quick-create project. */
import { useState } from 'react'
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
import { createProject } from '../../lib/projectActions'
import { addProjectsToPortfolio } from '../../lib/portfolios/portfolioActions'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useTeamsStore } from '../../stores/entities'
import { PROJECT_VIEWS } from '../projects/projectUtils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  portfolioId: string
  existingProjectIds: string[]
}

export function PortfolioAddProjectsDialog({
  open,
  onOpenChange,
  workspaceId,
  portfolioId,
  existingProjectIds,
}: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived && !existingProjectIds.includes(p.id))
  )
  const teams = useTeamsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const [selected, setSelected] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '')
  const [loading, setLoading] = useState(false)

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const addSelected = async () => {
    if (!selected.length) return
    setLoading(true)
    try {
      await addProjectsToPortfolio(portfolioId, selected)
      setSelected([])
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const createAndAttach = async () => {
    if (!currentUserId || !newName.trim() || !teamId) return
    setLoading(true)
    try {
      const project = await createProject({
        workspaceId,
        teamId,
        ownerId: currentUserId,
        name: newName.trim(),
        color: 'primary',
        privacy: 'public_to_team',
        defaultView: 'list',
        enabledViews: [...PROJECT_VIEWS],
      })
      await addProjectsToPortfolio(portfolioId, [project.id])
      setNewName('')
      setCreating(false)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans">Add work to portfolio</DialogTitle>
        </DialogHeader>
        {creating ? (
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Project name</Label>
              <Input className="tl-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
            {projects.length ? projects.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span>{p.iconEmoji ?? '📁'} {p.name}</span>
              </label>
            )) : (
              <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>All workspace projects are already in this portfolio.</p>
            )}
          </div>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {!creating && (
            <Button variant="outline" className="mr-auto" onClick={() => setCreating(true)}>
              Create new project
            </Button>
          )}
          {creating ? (
            <>
              <Button variant="ghost" onClick={() => setCreating(false)}>Back</Button>
              <Button className="tl-btn-primary border-0" disabled={loading || !newName.trim()} onClick={() => void createAndAttach()}>
                Create & add
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="tl-btn-primary border-0" disabled={loading || !selected.length} onClick={() => void addSelected()}>
                Add projects
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

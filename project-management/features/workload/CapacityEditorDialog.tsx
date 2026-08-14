'use client'

/** Dialog to edit per-person weekly capacity and time off. */
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
import { DEFAULT_CAPACITY_HOURS_PER_WEEK } from '../../lib/workload/constants'
import { useUsersStore } from '../../stores/entities'
import type { User, UserTimeOff } from '../../types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  users: User[]
  canEdit: boolean
}

/** Manager-facing capacity and time-off editor. */
export function CapacityEditorDialog({ open, onOpenChange, users, canEdit }: Props) {
  const updateUser = useUsersStore((s) => s.update)
  const [drafts, setDrafts] = useState<Record<string, { capacity: string; timeOff: UserTimeOff[] }>>({})

  useEffect(() => {
    if (!open) return
    const next: Record<string, { capacity: string; timeOff: UserTimeOff[] }> = {}
    users.forEach((u) => {
      next[u.id] = {
        capacity: String(u.capacityHoursPerWeek ?? DEFAULT_CAPACITY_HOURS_PER_WEEK),
        timeOff: u.timeOff ? [...u.timeOff] : [],
      }
    })
    setDrafts(next)
  }, [open, users])

  async function save() {
    if (!canEdit) return
    await Promise.all(
      users.map((u) => {
        const d = drafts[u.id]
        if (!d) return Promise.resolve()
        const capacityHoursPerWeek = Math.max(1, Number(d.capacity) || DEFAULT_CAPACITY_HOURS_PER_WEEK)
        return updateUser(u.id, { capacityHoursPerWeek, timeOff: d.timeOff })
      })
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit capacity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {users.map((user) => {
            const draft = drafts[user.id]
            if (!draft) return null
            return (
              <div key={user.id} className="rounded-lg border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
                <p className="text-sm font-medium">{user.name}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`cap-${user.id}`} className="text-xs">Hours / week</Label>
                    <Input
                      id={`cap-${user.id}`}
                      type="number"
                      min={1}
                      value={draft.capacity}
                      onChange={(e) =>
                        setDrafts((s) => ({
                          ...s,
                          [user.id]: { ...draft, capacity: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
                <TimeOffEditor
                  blocks={draft.timeOff}
                  onChange={(timeOff) =>
                    setDrafts((s) => ({ ...s, [user.id]: { ...draft, timeOff } }))
                  }
                />
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="tl-btn-primary border-0" disabled={!canEdit} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TimeOffEditor({
  blocks,
  onChange,
}: {
  blocks: UserTimeOff[]
  onChange: (blocks: UserTimeOff[]) => void
}) {
  return (
    <div className="mt-3 space-y-2">
      <Label className="text-xs">Time off</Label>
      {blocks.map((block, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <Input type="date" className="h-8 text-xs" value={block.start}
            onChange={(e) => {
              const next = [...blocks]
              next[i] = { ...block, start: e.target.value }
              onChange(next)
            }}
          />
          <Input type="date" className="h-8 text-xs" value={block.end}
            onChange={(e) => {
              const next = [...blocks]
              next[i] = { ...block, end: e.target.value }
              onChange(next)
            }}
          />
          <Input placeholder="Reason" className="h-8 flex-1 text-xs" value={block.reason ?? ''}
            onChange={(e) => {
              const next = [...blocks]
              next[i] = { ...block, reason: e.target.value || undefined }
              onChange(next)
            }}
          />
          <Button variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => onChange(blocks.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="h-8 text-xs"
        onClick={() => onChange([...blocks, { start: '', end: '' }])}
      >
        Add time off
      </Button>
    </div>
  )
}

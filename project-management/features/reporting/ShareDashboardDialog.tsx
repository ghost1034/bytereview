'use client'

/** Share dashboard dialog — visibility and shared editors. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import type { ReportingDashboard, DashboardVisibility } from '../../lib/reporting/types'
import { now } from '../../lib/time'
import { useDashboardsStore, useUsersStore } from '../../stores/entities'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboard: ReportingDashboard
}

/** Configure dashboard visibility and shared editors. */
export function ShareDashboardDialog({ open, onOpenChange, dashboard }: Props) {
  const update = useDashboardsStore((s) => s.update)
  const users = useUsersStore((s) => s.list())
  const [visibility, setVisibility] = useState<DashboardVisibility>(dashboard.visibility ?? 'private')
  const [sharedWith, setSharedWith] = useState<string[]>(dashboard.sharedWith)

  const toggleUser = (id: string) => {
    setSharedWith((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]))
  }

  const save = async () => {
    await update(dashboard.id, {
      visibility,
      sharedWith: visibility === 'people' ? sharedWith : [],
      updatedAt: now(),
    } as Partial<ReportingDashboard>)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">Share dashboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as DashboardVisibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="people">Specific people</SelectItem>
                <SelectItem value="workspace">Workspace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {visibility === 'people' ? (
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={sharedWith.includes(user.id)} onCheckedChange={() => toggleUser(user.id)} />
                  {user.name}
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="tl-btn-primary border-0" onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

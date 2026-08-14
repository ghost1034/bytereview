'use client'

/** Share dashboard dialog — visibility plus explicit viewer/editor roles. */
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
  const [editorIds, setEditorIds] = useState<string[]>(dashboard.editorIds ?? dashboard.sharedWith)
  const [viewerIds, setViewerIds] = useState<string[]>(dashboard.viewerIds ?? [])

  const toggleViewer = (id: string) => {
    setViewerIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]))
  }
  const toggleEditor = (id: string) => {
    setEditorIds((prev) => (prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]))
    setViewerIds((prev) => prev.filter((u) => u !== id))
  }

  const save = async () => {
    await update(dashboard.id, {
      visibility,
      sharedWith: visibility === 'private' ? [] : editorIds,
      editorIds: visibility === 'private' ? [] : editorIds,
      viewerIds: visibility === 'people' ? viewerIds : [],
      updatedAt: now(),
    } as Partial<ReportingDashboard>)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-sans">Share dashboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as DashboardVisibility)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="people">Specific people</SelectItem>
                <SelectItem value="workspace">Workspace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {visibility === 'people' ? (
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs font-medium" style={{ color: 'hsl(var(--foreground-muted))' }}>
                <span>Person</span><span>Viewer</span><span>Editor</span>
              </div>
              {users.filter((user) => user.id !== dashboard.ownerId).map((user) => (
                <div key={user.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                  <span>{user.name}</span>
                  <Checkbox
                    aria-label={`${user.name} viewer`}
                    checked={viewerIds.includes(user.id)}
                    disabled={editorIds.includes(user.id)}
                    onCheckedChange={() => toggleViewer(user.id)}
                  />
                  <Checkbox
                    aria-label={`${user.name} editor`}
                    checked={editorIds.includes(user.id)}
                    onCheckedChange={() => toggleEditor(user.id)}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className=" border-0" onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

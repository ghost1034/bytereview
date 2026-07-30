'use client'

/** Create dashboard dialog with optional template picker. */
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
import { buildEmptyDashboard, chartsFromTemplate, layoutForCharts } from '../../lib/reporting/dashboardActions'
import { chartsForDashboardTemplate, DASHBOARD_TEMPLATES } from '../../lib/reporting/templates'
import { useAuthStore } from '../../stores/auth'
import { useDashboardsStore } from '../../stores/entities'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  onCreated: (id: string) => void
}

/** Dialog to name a dashboard and optionally seed from a template. */
export function CreateDashboardDialog({ open, onOpenChange, workspaceId, onCreated }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const add = useDashboardsStore((s) => s.add)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState<string>('blank')
  const [loading, setLoading] = useState(false)

  const reset = () => {
    setName('')
    setTemplateId('blank')
  }

  const submit = async () => {
    if (!currentUserId || !name.trim()) return
    setLoading(true)
    let dashboard = buildEmptyDashboard(workspaceId, currentUserId, name.trim())
    if (templateId !== 'blank') {
      const charts = chartsFromTemplate(chartsForDashboardTemplate(templateId))
      dashboard = { ...dashboard, charts, layout: layoutForCharts(charts) }
    }
    await add(dashboard)
    setLoading(false)
    onOpenChange(false)
    reset()
    onCreated(dashboard.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif">New dashboard</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="dash-name">Name</Label>
            <Input id="dash-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Team productivity" />
          </div>
          <div className="space-y-2">
            <Label>Start from template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="tl-popover-surface z-[100]">
                <SelectItem value="blank">Blank dashboard</SelectItem>
                {DASHBOARD_TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="tl-btn-primary border-0" disabled={!name.trim() || loading} onClick={() => void submit()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

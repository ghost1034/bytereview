'use client'

/** Schedule digest dialog — frequency and recipients. */
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
import { nextRunForFrequency } from '../../lib/reporting/scheduler'
import type { DashboardSchedule, ReportingDashboard } from '../../lib/reporting/types'
import { now } from '../../lib/time'
import { useDashboardsStore } from '../../stores/entities'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboard: ReportingDashboard
}

/** Save a digest schedule consumed only by the server maintenance worker. */
export function ScheduleDigestDialog({ open, onOpenChange, dashboard }: Props) {
  const update = useDashboardsStore((s) => s.update)
  const [frequency, setFrequency] = useState<DashboardSchedule['frequency']>(
    dashboard.schedule?.frequency ?? 'weekly_mon'
  )
  const [recipients, setRecipients] = useState(dashboard.schedule?.recipients.join(', ') ?? '')

  const save = async () => {
    const list = recipients
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
    const schedule: DashboardSchedule = {
      frequency,
      recipients: list,
      nextRunAt: nextRunForFrequency(frequency),
    }
    await update(dashboard.id, { schedule, updatedAt: now() } as Partial<ReportingDashboard>)
    onOpenChange(false)
  }

  const clear = async () => {
    await update(dashboard.id, { schedule: undefined, updatedAt: now() } as Partial<ReportingDashboard>)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-sans">Schedule digest</DialogTitle>
        </DialogHeader>
        <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
          The server generates a current PNG snapshot and delivers it at the next scheduled run.
        </p>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={(v) => setFrequency(v as DashboardSchedule['frequency'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly_mon">Weekly (Monday)</SelectItem>
                <SelectItem value="monthly_1st">Monthly (1st)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipients">Recipients</Label>
            <Input
              id="recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="you@company.com, teammate@company.com"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {dashboard.schedule ? (
            <Button variant="ghost" onClick={() => void clear()}>
              Remove schedule
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button className="tl-btn-primary border-0" onClick={() => void save()}>
              Save schedule
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Task, User } from '../../types'
import { userWeeklyCapacity } from '../../lib/workload'

export function PeopleDrilldownDialog({ open, onOpenChange, user, tasks }: { open: boolean; onOpenChange: (open: boolean) => void; user?: User; tasks: Task[] }) {
  if (!user) return null
  const today = new Date().toISOString().slice(0, 10)
  const todayTasks = tasks.filter((task) => task.assigneeId === user.id && (task.dueOn === today || task.startOn === today))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent aria-describedby={undefined} data-workload-people-drilldown>
    <DialogHeader><DialogTitle>{user.name}</DialogTitle></DialogHeader>
    <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{user.jobTitle ?? user.email}</p>
    <div className="grid grid-cols-2 gap-3"><div className="rounded-lg border p-3"><p className="text-xs">Weekly capacity</p><strong>{userWeeklyCapacity(user)}h</strong></div><div className="rounded-lg border p-3"><p className="text-xs">Time-off blocks</p><strong>{user.timeOff?.length ?? 0}</strong></div></div>
    <section><h3 className="mb-2 text-sm font-semibold">Today&apos;s work</h3>{todayTasks.length ? <ul className="space-y-1 text-sm">{todayTasks.map((task) => <li key={task.id}>{task.name}</li>)}</ul> : <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No scheduled work today.</p>}</section>
    <section><h3 className="mb-2 text-sm font-semibold">Capacity history</h3><p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Current capacity {userWeeklyCapacity(user)}h/week · {user.timeOff?.length ?? 0} recorded time-off period(s).</p></section>
  </DialogContent></Dialog>
}

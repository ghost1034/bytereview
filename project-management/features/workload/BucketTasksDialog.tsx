'use client'

/** Task list dialog for a selected person + time bucket. */
import { Calendar, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateTask } from '../../lib/taskActions'
import { tasksInBucketForUser } from '../../lib/workload'
import { UNASSIGNED_USER_ID } from '../../lib/workload/constants'
import type { TimeBucket } from '../../lib/workload/buckets'
import type { Task, User } from '../../types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userLabel: string
  bucket: TimeBucket | null
  tasks: Task[]
  users: User[]
  actorId: string
}

/** Draggable tasks with inline reassign and reschedule. */
export function BucketTasksDialog({
  open,
  onOpenChange,
  userId,
  userLabel,
  bucket,
  tasks,
  users,
  actorId,
}: Props) {
  if (!bucket) return null
  const bucketTasks = tasksInBucketForUser(tasks, userId, bucket.start, bucket.end)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{userLabel}</DialogTitle>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            {bucket.label} · drag tasks onto another row or cell to rebalance
          </p>
        </DialogHeader>
        <ul className="space-y-2">
          {bucketTasks.length === 0 ? (
            <li className="py-6 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
              No tasks in this period.
            </li>
          ) : (
            bucketTasks.map((task) => (
              <li
                key={task.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/task-id', task.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className="rounded-md border p-3"
                style={{ borderColor: 'var(--border-subtle)' }}
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab" style={{ color: 'var(--ink-muted)' }} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-medium">{task.name}</p>
                    <Select
                      value={task.assigneeId ?? UNASSIGNED_USER_ID}
                      onValueChange={(v) => {
                        void updateTask(
                          task.id,
                          { assigneeId: v === UNASSIGNED_USER_ID ? undefined : v },
                          actorId
                        )
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="tl-popover-surface z-[100]">
                        <SelectItem value={UNASSIGNED_USER_ID}>Unassigned</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--ink-muted)' }} />
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={task.dueOn ?? ''}
                        onChange={(e) => {
                          const dueOn = e.target.value || undefined
                          void updateTask(task.id, { dueOn, startOn: task.startOn ?? dueOn }, actorId)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      </DialogContent>
    </Dialog>
  )
}

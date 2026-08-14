'use client'

/**
 * QuickAddTaskDialog — global quick add (name, assignee, due, project/section, hotkey c).
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { createTask } from '../../lib/taskActions'
import { toISODate } from '../../lib/time'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useSectionsStore, useUsersStore, useWorkspacesStore } from '../../stores/entities'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  defaultProjectId?: string
}

export function QuickAddTaskDialog({ open, onOpenChange, workspaceId, defaultProjectId }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState(defaultProjectId ?? '')
  const [sectionId, setSectionId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [openAfter, setOpenAfter] = useState(false)

  const projects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId && !p.archived))
  const sections = useSectionsStore((s) => s.list().filter((s) => s.projectId === projectId))
  const users = useUsersStore((s) => s.list())
  const workspace = useWorkspacesStore((s) => s.getById(workspaceId))

  const memberUsers = useMemo(() => {
    const ids = new Set(workspace?.memberIds ?? users.map((u) => u.id))
    return users.filter((u) => ids.has(u.id))
  }, [users, workspace?.memberIds])

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId)
  }, [defaultProjectId])

  useEffect(() => {
    if (!projectId) {
      setSectionId('')
      return
    }
    const first = sections[0]?.id
    if (first && !sectionId) setSectionId(first)
  }, [projectId, sections, sectionId])

  const openTask = (taskId: string) => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    params.set('task', taskId)
    router.push(`${pathname}?${params.toString()}`)
  }

  const submit = async () => {
    if (!currentUserId || !name.trim()) return
    const task = await createTask({
      workspaceId,
      name: name.trim(),
      projectId: projectId || undefined,
      sectionId: projectId && sectionId ? sectionId : undefined,
      assigneeId: assigneeId || undefined,
      dueOn: dueOn || undefined,
      actorId: currentUserId,
    })
    setName('')
    setDueOn('')
    setAssigneeId('')
    onOpenChange(false)
    toast({
      title: 'Task created',
      description: task.name,
      className: 'tl-toast border-l-4',
      style: { borderLeftColor: 'hsl(var(--success))' },
      action: (
        <ToastAction altText="Open task" onClick={() => openTask(task.id)}>
          Open task
        </ToastAction>
      ),
    })
    if (openAfter) openTask(task.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-sans">Quick add task</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2">
            <Label htmlFor="task-name">Task name</Label>
            <Input
              id="task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-input bg-background text-foreground"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label>Assignee</Label>
            <Select value={assigneeId || '__none'} onValueChange={(v) => setAssigneeId(v === '__none' ? '' : v)}>
              <SelectTrigger className="rounded-md border border-input bg-background text-foreground">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="__none">Unassigned</SelectItem>
                {currentUserId ? (
                  <SelectItem value={currentUserId}>Me</SelectItem>
                ) : null}
                {memberUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-due">Due date</Label>
            <Input
              id="task-due"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              className="rounded-md border border-input bg-background text-foreground"
              min={toISODate(new Date())}
            />
          </div>
          <div className="grid gap-2">
            <Label>Project</Label>
            <Select value={projectId || '__none'} onValueChange={(v) => setProjectId(v === '__none' ? '' : v)}>
              <SelectTrigger className="rounded-md border border-input bg-background text-foreground">
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent className="z-[100]">
                <SelectItem value="__none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.iconEmoji ? `${p.iconEmoji} ` : ''}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {projectId && sections.length ? (
            <div className="grid gap-2">
              <Label>Section</Label>
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger className="rounded-md border border-input bg-background text-foreground">
                  <SelectValue placeholder="Section" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Checkbox id="open-after" checked={openAfter} onCheckedChange={(v) => setOpenAfter(Boolean(v))} />
            <Label htmlFor="open-after" className="text-sm font-normal">
              Open task details after creating
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button className=" border-0" disabled={!name.trim()} onClick={() => void submit()}>
            Add task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

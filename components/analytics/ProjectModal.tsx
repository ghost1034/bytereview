'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import {
  useCreateAnalyticsProject,
  useUpdateAnalyticsProject,
} from '@/hooks/useAnalyticsProjects'
import {
  PROJECT_MODULE_LABELS,
  PROJECT_MODULE_OPTIONS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_OPTIONS,
} from '@/lib/analytics/labels'
import type {
  AnalyticsClient,
  AnalyticsFirmMember,
  AnalyticsProject,
  AnalyticsProjectModule,
  AnalyticsProjectStatus,
} from '@/lib/analytics/types'

const NONE = '__none__'

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project?: AnalyticsProject | null
  clients: AnalyticsClient[]
  members: AnalyticsFirmMember[]
}

function memberLabel(member: AnalyticsFirmMember): string {
  return member.display_name || member.email
}

export function ProjectModal({
  isOpen,
  onClose,
  project,
  clients,
  members,
}: ProjectModalProps) {
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState<string>(NONE)
  const [assigneeId, setAssigneeId] = useState<string>(NONE)
  const [status, setStatus] = useState<AnalyticsProjectStatus>('draft')
  const [module, setModule] = useState<AnalyticsProjectModule>('other')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')

  const { toast } = useToast()
  const createMutation = useCreateAnalyticsProject()
  const updateMutation = useUpdateAnalyticsProject()
  const isSaving = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    if (!isOpen) return
    setName(project?.name ?? '')
    setClientId(project?.client_id ?? NONE)
    setAssigneeId(project?.assigned_to_user_id ?? NONE)
    setStatus((project?.status as AnalyticsProjectStatus) ?? 'draft')
    setModule((project?.module as AnalyticsProjectModule) ?? 'other')
    setDueDate(project?.due_date ?? '')
    setDescription(project?.description ?? '')
  }, [isOpen, project])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast({
        title: 'Validation error',
        description: 'Project name is required.',
        variant: 'destructive',
      })
      return
    }

    const payload = {
      name: name.trim(),
      client_id: clientId === NONE ? null : clientId,
      assigned_to_user_id: assigneeId === NONE ? null : assigneeId,
      status,
      module,
      due_date: dueDate || null,
      description: description.trim() || undefined,
    }

    try {
      if (project) {
        await updateMutation.mutateAsync({ projectId: project.id, data: payload })
        toast({ title: 'Project updated', description: `${payload.name} has been updated.` })
      } else {
        await createMutation.mutateAsync(payload)
        toast({ title: 'Project created', description: `${payload.name} has been created.` })
      }
      onClose()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save project.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit project' : 'New project'}</DialogTitle>
          <DialogDescription>
            {project ? 'Update this project’s details.' : 'Create a project for your firm.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name *</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q4 close review"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="No client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned to</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as AnalyticsProjectStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PROJECT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Module</Label>
              <Select
                value={module}
                onValueChange={(v) => setModule(v as AnalyticsProjectModule)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_MODULE_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PROJECT_MODULE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-due">Due date</Label>
            <Input
              id="project-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              {project ? 'Save changes' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default ProjectModal

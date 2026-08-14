'use client'

/**
 * CreateProjectDialog — multi-step project creation flow.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BUSINESS_TEMPLATES } from '../../lib/templates/businessTemplates'
import { createProject } from '../../lib/projectActions'
import type { ProjectView } from '../../types'
import { useAuthStore } from '../../stores/auth'
import { useTeamsStore, useTemplatesStore } from '../../stores/entities'
import { TasklyticDialogContent } from '../shell/TasklyticDialogContent'
import {
  CreateProjectChooseStep,
  CreateProjectDetailsStep,
  CreateProjectViewsStep,
} from './CreateProjectSteps'
import { PROJECT_VIEWS } from './projectUtils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

export function CreateProjectDialog({ open, onOpenChange, workspaceId }: Props) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const teams = useTeamsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const userTemplates = useTemplatesStore((s) => s.list())
  const [step, setStep] = useState(1)
  const [mode, setMode] = useState<'blank' | 'template'>('blank')
  const [templateId, setTemplateId] = useState(BUSINESS_TEMPLATES[0]?.id ?? '')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [iconEmoji, setIconEmoji] = useState('📁')
  const [teamId, setTeamId] = useState('')
  const [color, setColor] = useState('primary')
  const [privacy, setPrivacy] = useState<'public_to_team' | 'private_to_members' | 'public_to_workspace'>('public_to_team')
  const [defaultView, setDefaultView] = useState<ProjectView>('list')
  const [enabledViews, setEnabledViews] = useState<ProjectView[]>([...PROJECT_VIEWS])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (teams[0]?.id && !teamId) setTeamId(teams[0].id)
  }, [teams, teamId])

  useEffect(() => {
    if (!open) {
      setStep(1)
      setMode('blank')
      setName('')
      setDescription('')
      setIconEmoji('📁')
      setColor('primary')
      setPrivacy('public_to_team')
      setDefaultView('list')
      setEnabledViews([...PROJECT_VIEWS])
    }
  }, [open])

  const submit = async () => {
    if (!currentUserId || !name.trim() || !teamId) return
    setLoading(true)
    try {
      const project = await createProject({
        workspaceId,
        teamId,
        ownerId: currentUserId,
        name: name.trim(),
        description: description.trim() || undefined,
        iconEmoji,
        color,
        privacy,
        defaultView,
        enabledViews,
        templateId: mode === 'template' ? templateId : undefined,
      })
      onOpenChange(false)
      router.push(`/dashboard/project-management/w/${workspaceId}/projects/${project.id}`)
    } finally {
      setLoading(false)
    }
  }

  const canNext = step === 1 || (step === 2 && name.trim() && teamId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">
            Create project {step > 1 ? `(step ${step} of 3)` : ''}
          </DialogTitle>
          <DialogDescription>Choose a starting point, project details, and the views your team will use.</DialogDescription>
        </DialogHeader>
        {step === 1 && (
          <CreateProjectChooseStep
            mode={mode}
            templateId={templateId}
            onModeChange={setMode}
            onTemplateChange={setTemplateId}
          />
        )}
        {step === 2 && (
          <CreateProjectDetailsStep
            workspaceId={workspaceId}
            name={name}
            description={description}
            iconEmoji={iconEmoji}
            color={color}
            teamId={teamId}
            privacy={privacy}
            teams={teams.map((t) => ({ id: t.id, name: t.name }))}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onIconChange={setIconEmoji}
            onColorChange={setColor}
            onTeamChange={setTeamId}
            onPrivacyChange={setPrivacy}
          />
        )}
        {step === 3 && (
          <CreateProjectViewsStep
            defaultView={defaultView}
            enabledViews={enabledViews}
            onDefaultChange={setDefaultView}
            onEnabledChange={setEnabledViews}
          />
        )}
        {userTemplates.length > 0 && step === 1 && (
          <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {userTemplates.length} saved workspace template{userTemplates.length === 1 ? '' : 's'} available in settings.
          </p>
        )}
        <DialogFooter>
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>Back</Button>
          )}
          {step < 3 ? (
            <Button
              className="tl-btn-primary border-0"
              disabled={step === 2 && !canNext}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button className="tl-btn-primary border-0" disabled={loading || !name.trim()} onClick={() => void submit()}>
              Create project
            </Button>
          )}
        </DialogFooter>
      </TasklyticDialogContent>
    </Dialog>
  )
}

'use client'

/**
 * OnboardingWizard — 5-step first-run modal (Welcome → About → Templates → Invite → Finish).
 * Skippable, resumable; provisions content on finish via the unified provisioning engine.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { StepIndicator } from '@/components/ui/step-indicator'
import { track } from '../../lib/analytics/track'
import { parseInviteEmails, sendWorkspaceInvites } from '../../lib/invites'
import type { Workspace } from '../../types'
import { setActiveRepositoryWorkspaceId } from '../../lib/repository/workspaceScope'
import { rehydrateWorkspaceStores } from '../../stores/hydrate'
import { useAuthStore, useUiStore } from '../../stores/auth'
import { useUsersStore, useWorkspacesStore } from '../../stores/entities'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { TasklyticDialogContent } from '../shell/TasklyticDialogContent'
import { completeOnboarding } from './completeOnboarding'
import {
  MAX_INDUSTRY_SELECTIONS,
  MAX_TEMPLATE_SELECTIONS,
  ONBOARDING_STEPS,
  STEP_LABELS,
  type OnboardingStepId,
} from './constants'
import { StepAboutTeam } from './StepAboutTeam'
import { StepFinish } from './StepFinish'
import { StepInviteTeammates } from './StepInviteTeammates'
import { StepPickTemplates } from './StepPickTemplates'
import { StepWelcome } from './StepWelcome'
import { startProductTour } from './ProductTour'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When true, replays from step 1 without auto-provisioning until finish. */
  replay?: boolean
}

function initialIndustries(profile?: Workspace['profile']): string[] {
  if (profile?.industries?.length) return profile.industries.slice(0, MAX_INDUSTRY_SELECTIONS)
  if (profile?.industry) return [profile.industry]
  return ['General business']
}

export function OnboardingWizard({ open, onOpenChange, replay = false }: Props) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const { workspaceId: routeWorkspaceId } = useWorkspaceContext()
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const workspaceId = routeWorkspaceId ?? activeWorkspaceId
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const workspace = useWorkspacesStore((s) => (workspaceId ? s.getById(workspaceId) : undefined))

  const completedSteps = user?.onboarding?.completedSteps ?? []
  const initialStep =
    ONBOARDING_STEPS.find((s) => !completedSteps.includes(s)) ?? ONBOARDING_STEPS[0]

  const [step, setStep] = useState<OnboardingStepId>(replay ? 'welcome' : initialStep)
  const [startedAt] = useState(() => Date.now())
  const [skippedSteps, setSkippedSteps] = useState<string[]>([])
  const [companyName, setCompanyName] = useState(workspace?.name ?? '')
  const [teamSize, setTeamSize] = useState(workspace?.profile?.teamSize ?? '')
  const [industries, setIndustries] = useState<string[]>(() => initialIndustries(workspace?.profile))
  const [primaryUseCase, setPrimaryUseCase] = useState(workspace?.profile?.primaryUseCase ?? '')
  const [role, setRole] = useState(workspace?.profile?.role ?? '')
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin' | 'guest'>('member')
  const [inviteNote, setInviteNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteNotice, setInviteNotice] = useState<string | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)

  const stepIndex = ONBOARDING_STEPS.indexOf(step)
  const progress = ((stepIndex + 1) / ONBOARDING_STEPS.length) * 100
  const industryLabel = industries.join(', ')

  const indicatorSteps = useMemo(
    () => ONBOARDING_STEPS.map((id) => ({ id, label: STEP_LABELS[id] })),
    []
  )

  const goBack = () => {
    const prev = ONBOARDING_STEPS[stepIndex - 1]
    if (prev) setStep(prev)
  }

  useEffect(() => {
    if (!open || !replay) return
    setStep('welcome')
    setSkippedSteps([])
    setSelectedTemplates([])
    setInviteEmails('')
    setCompanyName(workspace?.name ?? '')
    setTeamSize(workspace?.profile?.teamSize ?? '')
    setIndustries(initialIndustries(workspace?.profile))
    setPrimaryUseCase(workspace?.profile?.primaryUseCase ?? '')
    setRole(workspace?.profile?.role ?? '')
  }, [open, replay, workspace])

  useEffect(() => {
    if (open && step === 'welcome') {
      track('onboarding_started', { workspaceId: workspaceId ?? '' })
    }
  }, [open, step, workspaceId])

  useEffect(() => {
    if (open) {
      track('onboarding_step_viewed', { step, industry: industryLabel })
    }
  }, [open, step, industryLabel])

  const markStep = useCallback(async (stepId: OnboardingStepId) => {
    if (!currentUserId) return
    const latest = useUsersStore.getState().getById(currentUserId)
    const prev = latest?.onboarding
    const steps = Array.from(new Set([...(prev?.completedSteps ?? []), stepId]))
    try {
      await useUsersStore.getState().update(currentUserId, {
        onboarding: { ...prev, completedSteps: steps },
      })
    } catch (err) {
      console.warn('Failed to persist onboarding step:', stepId, err)
    }
  }, [currentUserId])

  const advanceFromInvite = useCallback(async () => {
    await markStep('invite')
    setStep('finish')
  }, [markStep])

  const skipStep = async (stepId: OnboardingStepId) => {
    setSkippedSteps((prev) => Array.from(new Set([...prev, stepId])))
    await markStep(stepId)
    const next = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(stepId) + 1]
    if (next) setStep(next)
  }

  const toggleTemplate = (id: string) => {
    if (id === 'blank') {
      setSelectedTemplates([])
      track('onboarding_template_selected', { templateId: 'blank', industry: industryLabel })
      return
    }
    setSelectedTemplates((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      }
      const withoutBlank = prev.filter((x) => x !== 'blank')
      if (withoutBlank.length >= MAX_TEMPLATE_SELECTIONS) {
        return withoutBlank
      }
      track('onboarding_template_selected', { templateId: id, industry: industryLabel })
      return [...withoutBlank, id]
    })
  }

  const sendInvites = async () => {
    if (!currentUserId || !workspaceId) {
      setInviteError('Workspace is still loading. Wait a moment, or use “I’ll do this later” to skip.')
      return
    }

    setSaving(true)
    setInviteError(null)
    setInviteNotice(null)

    const emails = parseInviteEmails(inviteEmails)
    const latestUser = useUsersStore.getState().getById(currentUserId)
    const workspaceName =
      workspace?.name ?? (companyName.trim() || `${latestUser?.name?.split(' ')[0] ?? 'My'}'s Workspace`)

    try {
      if (emails.length > 0) {
        const results = await sendWorkspaceInvites({
          workspaceId,
          workspaceName,
          emails,
          role: inviteRole,
          invitedById: currentUserId,
          invitedByName: latestUser?.name ?? 'A teammate',
          note: inviteNote,
        })
        const failed = results.filter((r) => !r.ok)
        if (failed.length > 0) {
          const detail = failed.map((r) => `${r.email}: ${r.error ?? 'failed'}`).join('; ')
          setInviteNotice(
            failed.length === results.length
              ? `Invites could not be queued (${detail}). You can invite people later from Members.`
              : `Some invites failed (${detail}). Successful invites were queued.`
          )
        }
      }
    } catch (err) {
      console.warn('Onboarding invite step failed:', err)
      setInviteNotice(
        err instanceof Error
          ? `${err.message} You can invite teammates later from Members.`
          : 'Invites could not be sent. You can invite teammates later from Members.'
      )
    } finally {
      setSaving(false)
    }

    await advanceFromInvite()
  }

  const finish = async () => {
    if (!currentUserId) {
      setFinishError('Your user session is not ready. Wait a moment and try again.')
      return
    }
    if (!workspaceId) {
      setFinishError('Workspace is still loading. Wait a moment and try again.')
      return
    }

    setSaving(true)
    setFinishError(null)
    try {
      useUiStore.getState().setActiveWorkspaceId(workspaceId)
      setActiveRepositoryWorkspaceId(workspaceId)
      await rehydrateWorkspaceStores(workspaceId)

      const templateIds = selectedTemplates.filter((id) => id !== 'blank')
      const result = await completeOnboarding({
        userId: currentUserId,
        workspaceId,
        companyName,
        teamSize,
        industries,
        primaryUseCase,
        role,
        templateIds,
        skippedSteps,
        startedAt,
      })
      await rehydrateWorkspaceStores(workspaceId)

      onOpenChange(false)

      const targetProject = result.targetProjectId
      if (replay) {
        router.replace(`/dashboard/project-management/w/${workspaceId}/home`)
      } else if (targetProject) {
        router.replace(`/dashboard/project-management/w/${workspaceId}/projects/${targetProject}`)
      } else {
        router.replace(`/dashboard/project-management/w/${workspaceId}/home`)
      }

      if (!replay) {
        window.setTimeout(() => startProductTour(), 400)
      }
    } catch (err) {
      console.error('Onboarding finish failed:', err)
      setFinishError(
        err instanceof Error
          ? err.message
          : 'Setup could not be completed. Try again or skip and open your project from the sidebar.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TasklyticDialogContent className="max-w-2xl bg-background">
        <DialogHeader>
          <DialogTitle className="font-sans text-xl">{STEP_LABELS[step]}</DialogTitle>
          <Progress value={progress} className="mt-2 h-1" />
          <StepIndicator steps={indicatorSteps} currentStep={stepIndex} className="mt-4" />
        </DialogHeader>

        <div className="tasklytic-root" style={{ background: 'transparent' }}>
        {step === 'welcome' ? <StepWelcome onContinue={() => { void markStep('welcome'); setStep('about') }} /> : null}
        {step === 'about' ? (
          <StepAboutTeam
            companyName={companyName}
            onCompanyNameChange={setCompanyName}
            teamSize={teamSize}
            onTeamSizeChange={setTeamSize}
            industries={industries}
            onIndustriesChange={setIndustries}
            primaryUseCase={primaryUseCase}
            onPrimaryUseCaseChange={setPrimaryUseCase}
            role={role}
            onRoleChange={setRole}
          />
        ) : null}
        {step === 'templates' ? (
          <StepPickTemplates
            industries={industries}
            selectedIds={selectedTemplates}
            onToggle={toggleTemplate}
            onBrowseAll={() => workspaceId && router.push(`/dashboard/project-management/w/${workspaceId}/templates`)}
          />
        ) : null}
        {step === 'invite' ? (
          <>
            <StepInviteTeammates
              emails={inviteEmails}
              onEmailsChange={setInviteEmails}
              role={inviteRole}
              onRoleChange={setInviteRole}
              note={inviteNote}
              onNoteChange={setInviteNote}
            />
            {inviteError ? (
              <p className="text-sm text-destructive" role="alert">
                {inviteError}
              </p>
            ) : null}
          </>
        ) : null}
        {step === 'finish' ? (
          <>
            <StepFinish
              companyName={companyName}
              industries={industries}
              templateCount={selectedTemplates.filter((id) => id !== 'blank').length}
              inviteCount={parseInviteEmails(inviteEmails).length}
              notice={inviteNotice}
            />
            {finishError ? (
              <p className="text-sm text-destructive" role="alert">
                {finishError}
              </p>
            ) : null}
          </>
        ) : null}

        {step !== 'welcome' ? (
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              <Button variant="outline" disabled={saving} onClick={goBack}>
                Back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={saving}
                onClick={() => void skipStep(step)}
              >
                I&apos;ll do this later
              </Button>
            </div>
            <div className="flex gap-2">
              {step === 'about' ? (
                <Button
                  className="border-0 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={saving || industries.length === 0}
                  onClick={async () => {
                    await markStep('about')
                    setStep('templates')
                  }}
                >
                  Continue
                </Button>
              ) : null}
              {step === 'templates' ? (
                <Button
                  className="border-0 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={saving}
                  onClick={async () => {
                    await markStep('templates')
                    setStep('invite')
                  }}
                >
                  Continue
                </Button>
              ) : null}
              {step === 'invite' ? (
                <Button
                  className="border-0 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={saving}
                  onClick={() => void sendInvites()}
                >
                  {saving
                    ? 'Working…'
                    : parseInviteEmails(inviteEmails).length
                      ? 'Send invites & continue'
                      : 'Continue'}
                </Button>
              ) : null}
              {step === 'finish' ? (
                <Button className="border-0 bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving} onClick={() => void finish()}>
                  {saving ? 'Setting up…' : 'Finish setup'}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        ) : null}
        </div>
      </TasklyticDialogContent>
    </Dialog>
  )
}

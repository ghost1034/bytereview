'use client'

/**
 * Inline 3-step onboarding checklist when workspace has no projects.
 */
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useUsersStore } from '../../stores/entities'

type Props = {
  workspaceId: string
  onCreateProject: () => void
  onQuickAdd: () => void
  onInvite: () => void
}

const STEPS = [
  { id: 'project' as const, label: 'Create your first project', action: 'project' as const },
  { id: 'task' as const, label: 'Add a task', action: 'task' as const },
  { id: 'invite' as const, label: 'Invite a teammate', action: 'invite' as const },
]

/** Dismissible home checklist complementing the first-run wizard. */
export function HomeOnboardingChecklist({ workspaceId, onCreateProject, onQuickAdd, onInvite }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const projects = useProjectsStore((s) => s.list().filter((p) => p.workspaceId === workspaceId && !p.archived))
  const [dismissed, setDismissed] = useState(false)

  const done = user?.onboarding?.checklist ?? {}
  const allDone = STEPS.every((s) => done[s.id])
  if (dismissed || allDone || projects.length > 0) return null

  const run = (action: (typeof STEPS)[number]['action']) => {
    if (action === 'project') onCreateProject()
    else if (action === 'task') onQuickAdd()
    else onInvite()
  }

  const markDone = async (stepId: (typeof STEPS)[number]['id']) => {
    if (!currentUserId || !user) return
    await useUsersStore.getState().update(currentUserId, {
      onboarding: { ...user.onboarding, completedSteps: user.onboarding?.completedSteps ?? [], checklist: { ...done, [stepId]: true } },
    })
  }

  return (
    <div className="tl-card relative p-4 shadow-sm">
      <button
        type="button"
        className="absolute right-2 top-2 rounded p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Dismiss checklist"
        onClick={() => setDismissed(true)}
      >
        <X className="h-4 w-4" style={{ color: 'hsl(var(--foreground-muted))' }} />
      </button>
      <h2 className="font-sans text-lg">Getting started</h2>
      <p className="mt-1 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Three small steps to make this workspace yours.
      </p>
      <ol className="mt-4 space-y-2">
        {STEPS.map((step) => (
          <li key={step.id} className="flex items-center gap-2 text-sm">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{
                background: done[step.id] ? 'hsl(var(--success-soft))' : 'hsl(var(--surface-muted))',
                color: done[step.id] ? 'hsl(var(--success))' : 'hsl(var(--foreground-muted))',
              }}
            >
              {done[step.id] ? <Check className="h-3 w-3" /> : null}
            </span>
            <span className="flex-1">{step.label}</span>
            {!done[step.id] ? (
              <Button size="sm" variant="outline" onClick={() => { run(step.action); void markDone(step.id) }}>
                Start
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

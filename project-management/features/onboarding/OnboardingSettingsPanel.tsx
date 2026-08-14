'use client'

/** Settings → Onboarding — restart setup wizard or add starter projects. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { useTeamsStore } from '../../stores/entities'
import { TEMPLATE_LIBRARY, countTemplateTasks } from '../../lib/templates/templateLibrary'
import { provisionPlan } from '../../lib/provisioning'
import { track } from '../../lib/analytics/track'
import { restartOnboardingWizard } from './restartOnboarding'

export function OnboardingSettingsPanel() {
  const { workspaceId, workspace } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const teams = useTeamsStore((s) => (workspaceId ? s.list().filter((t) => t.workspaceId === workspaceId) : []))
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!workspaceId || !userId || !workspace) return null

  const addProject = async () => {
    if (!selected) return
    setBusy(true)
    setMessage(null)
    try {
      await provisionPlan({
        mode: 'enrich',
        workspaceId,
        ownerId: userId,
        workspace: { name: workspace.name },
        projects: [{ templateId: selected, teamName: teams[0]?.name }],
      })
      track('template_used', { templateId: selected, workspaceId, source: 'settings' })
      setMessage('Starter project added to your workspace.')
      setSelected(null)
    } finally {
      setBusy(false)
    }
  }

  const restartSetup = async () => {
    setRestarting(true)
    setMessage(null)
    try {
      await restartOnboardingWizard(userId)
      setMessage('Setup wizard reopened — walk through your preferences again.')
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card text-card-foreground space-y-4 p-4 shadow-sm">
        <div>
          <h2 className="font-sans text-lg">Setup wizard</h2>
          <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Re-run the first-run setup to update your company profile, industries, templates, and invites.
          </p>
        </div>
        <Button
          variant="outline"
          className="tl-btn-secondary"
          disabled={restarting}
          onClick={() => void restartSetup()}
        >
          {restarting ? 'Opening…' : 'Restart setup wizard'}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card text-card-foreground space-y-4 p-4 shadow-sm">
        <div>
          <h2 className="font-sans text-lg">Starter templates</h2>
          <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Add another curated starter project from the template library.
          </p>
        </div>
      <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
        {TEMPLATE_LIBRARY.slice(0, 8).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelected(t.id)}
            className="rounded-lg border p-2 text-left text-sm"
            style={{
              borderColor: selected === t.id ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              background: selected === t.id ? 'hsl(var(--primary-soft))' : 'transparent',
            }}
          >
            {t.iconEmoji} {t.name} · {countTemplateTasks(t)} tasks
          </button>
        ))}
      </div>
      <Button className=" border-0" disabled={!selected || busy} onClick={() => void addProject()}>
        Add starter project
      </Button>
      {message ? (
        <p className="text-sm" style={{ color: 'hsl(var(--primary))' }}>
          {message}
        </p>
      ) : null}
      </div>
    </div>
  )
}

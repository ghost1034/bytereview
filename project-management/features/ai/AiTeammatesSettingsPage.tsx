'use client'

import { useEffect, useState } from 'react'
import { Bot, Clock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { usePageMeta } from '../../hooks/usePageMeta'
import { loadAiTeammates, saveAiTeammate, type AiTeammateJob } from '../../lib/ai/serverState'

const PRESETS = {
  tria: { name: 'Tria', description: 'Triages scoped work and proposes labels, priority, and assignees.', cadence: 'event', scopeType: 'workspace' },
  summarie: { name: 'Summarie', description: 'Summarizes long task discussions every day.', cadence: 'daily', scopeType: 'task' },
  statura: { name: 'Statura', description: 'Drafts a project status update every week.', cadence: 'weekly', scopeType: 'project' },
} as const

type Draft = {
  enabled: boolean
  cadence: 'event' | 'daily' | 'weekly'
  scopeType: 'workspace' | 'project' | 'task'
  scopeId: string
  dailyLimit: number
}

export function AiTeammatesSettingsPage() {
  const { workspaceId } = useWorkspaceContext()
  const [jobs, setJobs] = useState<AiTeammateJob[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [message, setMessage] = useState<string | null>(null)

  usePageMeta({ breadcrumbs: workspaceId ? [
    { label: 'Tasklytic', href: `/dashboard/project-management/w/${workspaceId}/home` },
    { label: 'Settings', href: `/dashboard/project-management/w/${workspaceId}/settings` },
    { label: 'AI teammates' },
  ] : [] })

  useEffect(() => {
    if (!workspaceId) return
    void loadAiTeammates(workspaceId).then(({ jobs: loaded }) => {
      setJobs(loaded)
      const next: Record<string, Draft> = {}
      for (const [id, preset] of Object.entries(PRESETS)) {
        const job = loaded.find((item) => item.teammate === id)
        next[id] = {
          enabled: job?.enabled ?? true,
          cadence: job?.cadence ?? preset.cadence,
          scopeType: job?.scope.type ?? preset.scopeType,
          scopeId: job?.scope.id ?? (preset.scopeType === 'workspace' ? workspaceId : ''),
          dailyLimit: job?.dailyLimit ?? 10,
        }
      }
      setDrafts(next)
    }).catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Could not load AI teammates'))
  }, [workspaceId])

  if (!workspaceId) return null

  const update = (id: string, patch: Partial<Draft>) => setDrafts((current) => ({
    ...current, [id]: { ...current[id], ...patch },
  }))

  const save = async (id: keyof typeof PRESETS) => {
    const draft = drafts[id]
    if (!draft?.scopeId) {
      setMessage('Choose a scope before saving this teammate.')
      return
    }
    setMessage(null)
    try {
      const existing = jobs.find((job) => job.teammate === id)
      const saved = await saveAiTeammate(workspaceId, {
        id: existing?.id,
        teammate: id,
        enabled: draft.enabled,
        cadence: draft.cadence,
        scope: { type: draft.scopeType, id: draft.scopeId },
        dailyLimit: draft.dailyLimit,
        nextRunAt: existing?.nextRunAt ?? new Date().toISOString(),
      })
      setJobs((current) => [...current.filter((job) => job.teammate !== id), saved])
      setMessage(`${PRESETS[id].name} schedule saved.`)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not save AI teammate')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-serif text-2xl"><Bot className="h-5 w-5" /> AI teammates</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-muted)' }}>
          Configure server-run assistants. Their output remains a proposal until a person reviews and accepts it.
        </p>
      </div>
      <div className="tl-card flex items-start gap-3 p-4 text-sm shadow-paper-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4" style={{ color: 'var(--primary)' }} />
        <p>Schedules use scoped context, daily limits, metered usage, retry audit trails, and administrator failure notifications.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.entries(PRESETS) as [keyof typeof PRESETS, (typeof PRESETS)[keyof typeof PRESETS]][]).map(([id, preset]) => {
          const draft = drafts[id]
          const job = jobs.find((item) => item.teammate === id)
          if (!draft) return <div key={id} className="tl-card h-72 animate-pulse" />
          return (
            <section key={id} className="tl-card space-y-4 p-4 shadow-paper-sm">
              <div className="flex items-start justify-between gap-2">
                <div><h2 className="font-serif text-lg">{preset.name}</h2><p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{preset.description}</p></div>
                <Switch aria-label={`Enable ${preset.name}`} checked={draft.enabled} onCheckedChange={(enabled) => update(id, { enabled })} />
              </div>
              <div className="space-y-1"><Label>Cadence</Label><Select value={draft.cadence} onValueChange={(cadence) => update(id, { cadence: cadence as Draft['cadence'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent className="tl-popover-surface"><SelectItem value="event">Event queue</SelectItem><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select></div>
              <div className="space-y-1"><Label>Scope</Label><div className="flex gap-2"><Select value={draft.scopeType} onValueChange={(scopeType) => update(id, { scopeType: scopeType as Draft['scopeType'], scopeId: scopeType === 'workspace' ? workspaceId : '' })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent className="tl-popover-surface"><SelectItem value="workspace">Workspace</SelectItem><SelectItem value="project">Project</SelectItem><SelectItem value="task">Task</SelectItem></SelectContent></Select><Input aria-label={`${preset.name} scope id`} value={draft.scopeId} disabled={draft.scopeType === 'workspace'} placeholder={`${draft.scopeType} id`} onChange={(event) => update(id, { scopeId: event.target.value })} /></div></div>
              <div className="space-y-1"><Label htmlFor={`${id}-limit`}>Daily run limit</Label><Input id={`${id}-limit`} type="number" min={1} max={100} value={draft.dailyLimit} onChange={(event) => update(id, { dailyLimit: Number(event.target.value) })} /></div>
              {job ? <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-faint)' }}><Clock className="h-3 w-3" /> Next run {new Date(job.nextRunAt).toLocaleString()}</p> : null}
              <Button className="tl-btn-primary w-full" onClick={() => void save(id)}>Save {preset.name}</Button>
            </section>
          )
        })}
      </div>
      {message ? <p role="status" className="text-sm" style={{ color: 'var(--ink-muted)' }}>{message}</p> : null}
    </div>
  )
}

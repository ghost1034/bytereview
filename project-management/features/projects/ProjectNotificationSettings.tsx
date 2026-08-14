'use client'

/** Project-level notification defaults persisted with project settings. */
import { Switch } from '@/components/ui/switch'
import { now } from '../../lib/time'
import { useProjectsStore } from '../../stores/entities'
import type { Project } from '../../types'

const DEFAULTS = {
  taskActivity: true,
  statusUpdates: true,
  newFiles: true,
  mentions: true,
}

const OPTIONS: Array<{ key: keyof typeof DEFAULTS; label: string; detail: string }> = [
  { key: 'taskActivity', label: 'Task activity', detail: 'Assignments, completions, and due-date changes.' },
  { key: 'statusUpdates', label: 'Status updates', detail: 'New project status posts and risk changes.' },
  { key: 'newFiles', label: 'New files', detail: 'Attachments added to project tasks.' },
  { key: 'mentions', label: 'Mentions', detail: 'Comments and messages that mention you.' },
]

export function ProjectNotificationSettings({ project }: { project: Project }) {
  const update = useProjectsStore((s) => s.update)
  const settings = { ...DEFAULTS, ...project.notificationSettings }

  const setOption = async (key: keyof typeof DEFAULTS, checked: boolean) => {
    await update(project.id, {
      notificationSettings: { ...settings, [key]: checked },
      modifiedAt: now(),
    })
  }

  return (
    <div className="space-y-2">
      {OPTIONS.map((option) => (
        <label key={option.key} className="flex items-start justify-between gap-4 rounded-lg border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
          <span>
            <span className="block text-sm font-medium">{option.label}</span>
            <span className="block text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{option.detail}</span>
          </span>
          <Switch checked={settings[option.key]} onCheckedChange={(checked) => void setOption(option.key, Boolean(checked))} />
        </label>
      ))}
    </div>
  )
}

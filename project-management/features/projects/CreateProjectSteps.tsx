'use client'

import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BUSINESS_TEMPLATES } from '../../lib/templates/businessTemplates'
import type { Project, ProjectView } from '../../types'
import { EmojiPicker } from '../workspaces/EmojiPicker'
import { ProjectColorPicker } from './ProjectColorPicker'
import { ProjectViewCards } from './ProjectViewCards'

type Mode = 'blank' | 'template'

type ChooseProps = {
  mode: Mode
  templateId: string
  onModeChange: (mode: Mode) => void
  onTemplateChange: (id: string) => void
}

/** Step 1 — choose blank project or business template. */
export function CreateProjectChooseStep({ mode, templateId, onModeChange, onTemplateChange }: ChooseProps) {
  const cards: { id: Mode; title: string; desc: string }[] = [
    { id: 'blank', title: 'Blank project', desc: 'Start from scratch with default sections and starter tasks.' },
    { id: 'template', title: 'From template', desc: 'Use a curated business template with sections and tasks.' },
  ]

  return (
    <div className="space-y-4 py-2">
      <div className="grid gap-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className="rounded-lg border border-border bg-card text-card-foreground p-4 text-left shadow-sm transition hover:shadow-md"
            style={mode === card.id ? { borderColor: 'hsl(var(--primary))' } : undefined}
            onClick={() => onModeChange(card.id)}
          >
            <p className="font-medium">{card.title}</p>
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{card.desc}</p>
          </button>
        ))}
      </div>
      {mode === 'template' && (
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2" style={{ borderColor: 'hsl(var(--border))' }}>
          {BUSINESS_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-lg p-2 text-left hover:bg-[hsl(var(--surface-muted))]"
              style={templateId === t.id ? { background: 'hsl(var(--primary-soft))' } : undefined}
              onClick={() => onTemplateChange(t.id)}
            >
              <span className="text-lg">{t.icon}</span>
              <span>
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{t.category}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type DetailsProps = {
  workspaceId: string
  name: string
  description: string
  iconEmoji: string
  color: string
  teamId: string
  privacy: Project['privacy']
  teams: { id: string; name: string }[]
  onNameChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onIconChange: (v: string) => void
  onColorChange: (v: string) => void
  onTeamChange: (v: string) => void
  onPrivacyChange: (v: Project['privacy']) => void
}

/** Step 2 — project name, team, icon, color, privacy. */
export function CreateProjectDetailsStep(props: DetailsProps) {
  if (!props.teams.length) {
    return (
      <p className="py-4 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        You need a team first.{' '}
        <Link href={`/dashboard/project-management/w/${props.workspaceId}/teams/new`} className="underline" style={{ color: 'hsl(var(--primary))' }}>
          Create a team
        </Link>
      </p>
    )
  }

  return (
    <div className="grid gap-4 py-2">
      <div className="grid gap-2">
        <Label htmlFor="project-name">Name</Label>
        <Input id="project-name" value={props.name} onChange={(e) => props.onNameChange(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-desc">Description</Label>
        <Input id="project-desc" value={props.description} onChange={(e) => props.onDescriptionChange(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
      </div>
      <div className="grid gap-2">
        <Label>Icon</Label>
        <EmojiPicker value={props.iconEmoji} onChange={props.onIconChange} />
      </div>
      <div className="grid gap-2">
        <Label>Color</Label>
        <ProjectColorPicker value={props.color} onChange={props.onColorChange} />
      </div>
      <div className="grid gap-2">
        <Label>Team</Label>
        <Select value={props.teamId} onValueChange={props.onTeamChange}>
          <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
          <SelectContent className="z-[100]">
            {props.teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Privacy</Label>
        <Select value={props.privacy} onValueChange={props.onPrivacyChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="public_to_team">Public to team</SelectItem>
            <SelectItem value="private_to_members">Private to members</SelectItem>
            <SelectItem value="public_to_workspace">Public to workspace</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

type ViewsProps = {
  defaultView: ProjectView
  enabledViews: ProjectView[]
  onDefaultChange: (v: ProjectView) => void
  onEnabledChange: (v: ProjectView[]) => void
}

/** Step 3 — default view and enabled views. */
export function CreateProjectViewsStep(props: ViewsProps) {
  return (
    <div className="py-2">
      <ProjectViewCards {...props} />
    </div>
  )
}

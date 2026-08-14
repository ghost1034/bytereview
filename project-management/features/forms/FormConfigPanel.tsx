'use client'

/** FormConfigPanel — form-level settings: mapping, branding, publish, confirmation. */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Form, Project, Section, User } from '../../types'

type Props = {
  form: Form
  projects: Project[]
  sections: Section[]
  members: User[]
  onChange: (patch: Partial<Form>) => void
}

/** Inspector panel for form-level configuration when no field is selected. */
export function FormConfigPanel({ form, projects, sections, members, onChange }: Props) {
  const projectSections = sections.filter((s) => s.projectId === form.projectId)

  const readImage = (file: File, key: 'coverImageDataUrl' | 'logoDataUrl') => {
    const reader = new FileReader()
    reader.onload = () =>
      onChange({ branding: { ...form.branding, [key]: String(reader.result) } })
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Form settings
      </p>
      <div className="grid gap-2">
        <Label htmlFor="form-name">Name</Label>
        <Input id="form-name" value={form.name} onChange={(e) => onChange({ name: e.target.value })} className="tl-input" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="form-desc">Description</Label>
        <Textarea id="form-desc" value={form.description ?? ''} onChange={(e) => onChange({ description: e.target.value })} rows={3} className="tl-input" />
      </div>
      <div className="grid gap-2">
        <Label>Target project</Label>
        <Select value={form.projectId} onValueChange={(v) => onChange({ projectId: v, defaultSectionId: undefined })}>
          <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.iconEmoji ?? '📁'} {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Default section</Label>
        <Select value={form.defaultSectionId ?? '__none'} onValueChange={(v) => onChange({ defaultSectionId: v === '__none' ? undefined : v })}>
          <SelectTrigger className="tl-input"><SelectValue placeholder="First section" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="__none">First section</SelectItem>
            {projectSections.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Default assignee</Label>
        <Select value={form.defaultAssigneeId ?? '__none'} onValueChange={(v) => onChange({ defaultAssigneeId: v === '__none' ? undefined : v })}>
          <SelectTrigger className="tl-input"><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="__none">Unassigned</SelectItem>
            {members.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label>Task title field</Label>
        <Select value={form.taskTitleFieldId ?? '__none'} onValueChange={(v) => onChange({ taskTitleFieldId: v === '__none' ? undefined : v })}>
          <SelectTrigger className="tl-input"><SelectValue placeholder="First field" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value="__none">First field</SelectItem>
            {form.fields.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="copy-desc">Copy answers to task description</Label>
        <Switch id="copy-desc" checked={form.copyAnswersToDescription} onCheckedChange={(v) => onChange({ copyAnswersToDescription: v })} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-msg">Confirmation message</Label>
        <Input id="confirm-msg" value={form.confirmationMessage} onChange={(e) => onChange({ confirmationMessage: e.target.value })} className="tl-input" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cover">Cover image</Label>
        <Input id="cover" type="file" accept="image/*" className="tl-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) readImage(f, 'coverImageDataUrl') }} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="logo">Logo</Label>
        <Input id="logo" type="file" accept="image/*" className="tl-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) readImage(f, 'logoDataUrl') }} />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="is-public">Published</Label>
        <Switch id="is-public" checked={form.isPublic} onCheckedChange={(v) => onChange({ isPublic: v })} />
      </div>
      {form.isPublic ? <div className="grid gap-2"><Label>Who can submit</Label><Select value={form.accessMode ?? 'public'} onValueChange={(value) => onChange({ accessMode: value as 'public' | 'workspace' })}><SelectTrigger aria-label="Form access"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="public">Anyone with the link</SelectItem><SelectItem value="workspace">Workspace members only</SelectItem></SelectContent></Select></div> : null}
    </div>
  )
}

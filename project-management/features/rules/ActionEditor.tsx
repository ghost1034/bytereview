'use client'

/** Single action row editor with type-specific params. */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ROUND_ROBIN_USER_ID, ASSIGNEE_USER_ID } from '../../lib/rulesEngine'
import type { CustomField, Project, RuleAction, Section, User } from '../../types'

const ACTION_TYPES: { value: RuleAction['type']; label: string }[] = [
  { value: 'assign_to', label: 'Assign to' },
  { value: 'set_due_in_days', label: 'Set due in N days' },
  { value: 'move_to_section', label: 'Move to section' },
  { value: 'add_to_project', label: 'Add to project' },
  { value: 'set_custom_field', label: 'Set custom field' },
  { value: 'add_collaborator', label: 'Add collaborator' },
  { value: 'send_notification', label: 'Send notification' },
  { value: 'create_subtask', label: 'Create subtask' },
  { value: 'send_email', label: 'Send email' },
]

type Props = {
  action: RuleAction
  onChange: (action: RuleAction) => void
  project: Project | undefined
  projects: Project[]
  sections: Section[]
  members: User[]
  customFields: CustomField[]
}

export function ActionEditor({
  action,
  onChange,
  projects,
  sections,
  members,
  customFields,
}: Props) {
  const setType = (type: RuleAction['type']) => {
    switch (type) {
      case 'assign_to':
        onChange({ type, userId: members[0]?.id ?? ROUND_ROBIN_USER_ID })
        break
      case 'set_due_in_days':
        onChange({ type, days: 7 })
        break
      case 'move_to_section':
        onChange({ type, sectionId: sections[0]?.id ?? '' })
        break
      case 'add_to_project':
        onChange({ type, projectId: projects[0]?.id ?? '' })
        break
      case 'set_custom_field':
        onChange({ type, customFieldId: customFields[0]?.id ?? '', value: '' })
        break
      case 'add_collaborator':
        onChange({ type, userId: members[0]?.id ?? '' })
        break
      case 'send_notification':
        onChange({ type, userId: members[0]?.id ?? '', message: 'Rule notification for {{taskName}}' })
        break
      case 'create_subtask':
        onChange({ type, templateName: 'Follow up on {{taskName}}' })
        break
      case 'send_email':
        onChange({ type, recipient: 'assignee', subject: 'Update: {{taskName}}', body: 'Task {{taskName}} is ready for review.' })
        break
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
      <Select value={action.type} onValueChange={(v) => setType(v as RuleAction['type'])}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent className="z-[100]">
          {ACTION_TYPES.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {action.type === 'assign_to' && (
        <Select value={action.userId} onValueChange={(userId) => onChange({ ...action, userId })}>
          <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
          <SelectContent className="z-[100]">
            <SelectItem value={ROUND_ROBIN_USER_ID}>Round-robin among members</SelectItem>
            {members.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {action.type === 'set_due_in_days' && (
        <Input
          type="number"
          min={0}
          className="rounded-md border border-input bg-background text-foreground"
          value={action.days}
          onChange={(e) => onChange({ ...action, days: Number(e.target.value) || 0 })}
        />
      )}

      {action.type === 'move_to_section' && (
        <Select value={action.sectionId} onValueChange={(sectionId) => onChange({ ...action, sectionId })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {action.type === 'add_to_project' && (
        <Select value={action.projectId} onValueChange={(projectId) => onChange({ ...action, projectId })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {action.type === 'set_custom_field' && (
        <div className="grid gap-2">
          <Select
            value={action.customFieldId}
            onValueChange={(customFieldId) => onChange({ ...action, customFieldId })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[100]">
              {customFields.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="rounded-md border border-input bg-background text-foreground"
            value={String(action.value ?? '')}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            placeholder="Value"
          />
        </div>
      )}

      {action.type === 'add_collaborator' && (
        <Select value={action.userId} onValueChange={(userId) => onChange({ ...action, userId })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="z-[100]">
            {members.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {action.type === 'send_notification' && (
        <div className="grid gap-2">
          <Select value={action.userId} onValueChange={(userId) => onChange({ ...action, userId })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value={ASSIGNEE_USER_ID}>Task assignee</SelectItem>
              {members.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="rounded-md border border-input bg-background text-foreground"
            value={action.message}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
            placeholder="Message (supports {{taskName}})"
          />
        </div>
      )}

      {action.type === 'create_subtask' && (
        <div className="grid gap-1">
          <Input
            className="rounded-md border border-input bg-background text-foreground"
            value={action.templateName}
            onChange={(e) => onChange({ ...action, templateName: e.target.value })}
          />
          <Label className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Supports {'{{taskName}}'}, {'{{assigneeName}}'}, {'{{today}}'}, {'{{dueIn:N}}'}
          </Label>
        </div>
      )}

      {action.type === 'send_email' && (
        <div className="grid gap-2">
          <Select value={action.recipient} onValueChange={(recipient) => onChange({ ...action, recipient })}>
            <SelectTrigger><SelectValue placeholder="Recipient" /></SelectTrigger>
            <SelectContent className="z-[100]">
              <SelectItem value="assignee">Task assignee</SelectItem>
              {members.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={action.subject} onChange={(e) => onChange({ ...action, subject: e.target.value })} placeholder="Subject" />
          <Input value={action.body} onChange={(e) => onChange({ ...action, body: e.target.value })} placeholder="Body" />
          <Label className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Supports {'{{taskName}}'}, {'{{assigneeName}}'}, and {'{{dueDate}}'}
          </Label>
        </div>
      )}
    </div>
  )
}

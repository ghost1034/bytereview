'use client'

/** Trigger picker — one trigger per rule with type-specific params. */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CustomField, Form, RuleTrigger, Section } from '../../types'

const TRIGGER_OPTIONS: { value: RuleTrigger['type']; label: string }[] = [
  { value: 'task_added_to_project', label: 'Task added to this project' },
  { value: 'task_moved_to_section', label: 'Task moved to a section' },
  { value: 'task_completed', label: 'Task completed' },
  { value: 'task_due_in_days', label: 'Task is due in N days' },
  { value: 'custom_field_changed', label: 'Custom field changed' },
  { value: 'form_submitted', label: 'Form submission' },
]

type Props = {
  trigger: RuleTrigger
  onChange: (trigger: RuleTrigger) => void
  sections: Section[]
  forms: Form[]
  customFields: CustomField[]
}

export function TriggerPicker({ trigger, onChange, sections, forms, customFields }: Props) {
  const setType = (type: RuleTrigger['type']) => {
    switch (type) {
      case 'task_added_to_project':
        onChange({ type })
        break
      case 'task_completed':
        onChange({ type })
        break
      case 'task_moved_to_section':
        onChange({ type, sectionId: sections[0]?.id ?? '' })
        break
      case 'task_due_in_days':
        onChange({ type, days: 1 })
        break
      case 'custom_field_changed':
        onChange({ type, customFieldId: customFields[0]?.id ?? '' })
        break
      case 'form_submitted':
        onChange({ type, formId: forms[0]?.id ?? '' })
        break
    }
  }

  return (
    <div className="grid gap-3">
      <Label>When</Label>
      <Select value={trigger.type} onValueChange={(v) => setType(v as RuleTrigger['type'])}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent className="z-[100]">
          {TRIGGER_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {trigger.type === 'task_moved_to_section' && (
        <Select value={trigger.sectionId} onValueChange={(sectionId) => onChange({ ...trigger, sectionId })}>
          <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent className="z-[100]">
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {trigger.type === 'task_due_in_days' && (
        <div className="flex items-center gap-2">
          <Label className="text-sm">Days</Label>
          <Input
            type="number"
            min={0}
            className="w-24 rounded-md border border-input bg-background text-foreground"
            value={trigger.days}
            onChange={(e) => onChange({ ...trigger, days: Number(e.target.value) || 0 })}
          />
        </div>
      )}

      {trigger.type === 'custom_field_changed' && (
        <div className="grid gap-2">
          <Select
            value={trigger.customFieldId}
            onValueChange={(customFieldId) => onChange({ ...trigger, customFieldId })}
          >
            <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
            <SelectContent className="z-[100]">
              {customFields.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Optional: to value"
            className="rounded-md border border-input bg-background text-foreground"
            value={trigger.toValue != null ? String(trigger.toValue) : ''}
            onChange={(e) =>
              onChange({ ...trigger, toValue: e.target.value || undefined })
            }
          />
        </div>
      )}

      {trigger.type === 'form_submitted' && (
        <Select value={trigger.formId} onValueChange={(formId) => onChange({ ...trigger, formId })}>
          <SelectTrigger><SelectValue placeholder="Form" /></SelectTrigger>
          <SelectContent className="z-[100]">
            {forms.map((f) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

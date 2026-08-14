'use client'

/** FormFieldEditor — inspector panel for editing a selected field. */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import type { FormField } from '../../types'
import { newOption } from '../../lib/forms/formFieldFactory'

type Props = {
  field: FormField
  onChange: (field: FormField) => void
}

/** Right inspector for the selected form field. */
export function FormFieldEditor({ field, onChange }: Props) {
  const patch = (partial: Partial<FormField>) => onChange({ ...field, ...partial } as FormField)

  return (
    <div className="space-y-4">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Field settings
      </p>
      <div className="grid gap-2">
        <Label htmlFor="field-label">Label</Label>
        <Input
          id="field-label"
          value={field.label}
          onChange={(e) => patch({ label: e.target.value })}
          className="tl-input"
        />
      </div>
      {(field.type === 'short_text' || field.type === 'long_text') && (
        <div className="grid gap-2">
          <Label htmlFor="field-placeholder">Placeholder</Label>
          <Input
            id="field-placeholder"
            value={field.placeholder ?? ''}
            onChange={(e) => patch({ placeholder: e.target.value })}
            className="tl-input"
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label htmlFor="field-required">Required</Label>
        <Switch
          id="field-required"
          checked={field.required}
          onCheckedChange={(v) => patch({ required: v })}
        />
      </div>
      {(field.type === 'dropdown' || field.type === 'multi_select') && (
        <OptionsEditor field={field} onChange={onChange} />
      )}
    </div>
  )
}

function OptionsEditor({
  field,
  onChange,
}: {
  field: Extract<FormField, { type: 'dropdown' | 'multi_select' }>
  onChange: (field: FormField) => void
}) {
  const updateOption = (id: string, label: string) => {
    onChange({
      ...field,
      options: field.options.map((o) => (o.id === id ? { ...o, label } : o)),
    })
  }

  const addOption = () => {
    onChange({
      ...field,
      options: [...field.options, newOption(`Option ${field.options.length + 1}`, field.options.length)],
    })
  }

  const removeOption = (id: string) => {
    if (field.options.length <= 1) return
    onChange({ ...field, options: field.options.filter((o) => o.id !== id) })
  }

  return (
    <div className="space-y-2">
      <Label>Options</Label>
      {field.options.map((o) => (
        <div key={o.id} className="flex gap-2">
          <Input
            value={o.label}
            onChange={(e) => updateOption(o.id, e.target.value)}
            className="tl-input"
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(o.id)}>
            ×
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addOption}>
        + Add option
      </Button>
    </div>
  )
}

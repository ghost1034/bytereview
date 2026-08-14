'use client'

/**
 * FormFieldRenderer — renders any FormField type for preview and public submit.
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { FormField } from '../../types'
import { AttachmentInput } from './AttachmentInput'

export type FormAnswers = Record<string, unknown>

type Props = {
  field: FormField
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
  error?: string
  directUploads?: boolean
}

/** Render a single form field input. */
export function FormFieldRenderer({ field, value, onChange, readOnly, error, directUploads }: Props) {
  const requiredMark = field.required ? ' *' : ''

  return (
    <div className="grid gap-2">
      <Label htmlFor={field.id}>
        {field.label}
        {requiredMark}
      </Label>
      {renderControl(field, value, onChange, readOnly, directUploads)}
      {error ? (
        <p className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function renderControl(
  field: FormField,
  value: unknown,
  onChange: (v: unknown) => void,
  readOnly?: boolean,
  directUploads?: boolean,
) {
  switch (field.type) {
    case 'short_text':
      return (
        <Input
          id={field.id}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          disabled={readOnly}
          className="tl-input"
        />
      )
    case 'long_text':
      return (
        <Textarea
          id={field.id}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          required={field.required}
          disabled={readOnly}
          rows={4}
          className="tl-input"
        />
      )
    case 'number':
      return (
        <Input
          id={field.id}
          type="number"
          value={value == null || value === '' ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          required={field.required}
          disabled={readOnly}
          className="tl-input"
        />
      )
    case 'date':
      return (
        <Input
          id={field.id}
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          disabled={readOnly}
          className="tl-input"
        />
      )
    case 'dropdown':
      return (
        <Select
          value={value ? String(value) : undefined}
          onValueChange={onChange}
          disabled={readOnly}
        >
          <SelectTrigger className="tl-input">
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent className="z-[100]">
            {field.options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'multi_select':
      return (
        <div className="space-y-2">
          {field.options.map((o) => {
            const selected = Array.isArray(value) && value.includes(o.id)
            return (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={readOnly}
                  onChange={(e) => {
                    const prev = Array.isArray(value) ? [...value] : []
                    onChange(
                      e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id)
                    )
                  }}
                />
                <span>{o.label}</span>
              </label>
            )
          })}
        </div>
      )
    case 'attachment':
      return (
        <AttachmentInput
          fieldId={field.id}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          required={field.required}
          directUpload={directUploads}
        />
      )
  }
}

'use client'

/** Inline editor bodies per custom field type (used inside FieldValueEditor). */
import { useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { CustomField, CustomFieldValue, User } from '../../types'
import { asExtendedField } from '../../lib/customFields/fieldConfig'
import { validateNumberInput } from '../../lib/customFields/formatValue'
import { parseISODateLocal, toISODate } from '../../lib/time'

const COLOR_TOKENS: Record<string, string> = {
  gray: 'var(--ink-muted)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  accent: 'var(--accent)',
  info: 'var(--info)',
  primary: 'var(--primary)',
}

type Props = {
  field: CustomField
  value: CustomFieldValue
  users: User[]
  onSave: (value: CustomFieldValue) => void
}

export function FieldEditorBody({ field, value, users, onSave }: Props) {
  switch (field.type) {
    case 'text': {
      const current = value.type === 'text' ? value.value : ''
      const multiline = asExtendedField(field).multiline
      if (multiline) {
        return (
          <Textarea
            autoFocus
            defaultValue={current}
            rows={3}
            onBlur={(e) => onSave({ type: 'text', value: e.target.value })}
          />
        )
      }
      return (
        <Input
          autoFocus
          defaultValue={current}
          placeholder="Enter text…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave({ type: 'text', value: e.currentTarget.value })
          }}
          onBlur={(e) => onSave({ type: 'text', value: e.target.value })}
        />
      )
    }
    case 'number':
      return <NumberEditor field={field} value={value} onSave={onSave} />
    case 'date':
      return <DateEditor field={field} value={value} onSave={onSave} />
    case 'dropdown':
      return <DropdownEditor field={field} value={value} onSave={onSave} />
    case 'multi_select':
      return <MultiSelectEditor field={field} value={value} onSave={onSave} />
    case 'people':
      return <PeopleEditor field={field} value={value} users={users} onSave={onSave} />
    case 'checkbox': {
      const checked = value.type === 'checkbox' ? value.value : false
      return (
        <div className="flex items-center gap-2">
          <Switch checked={checked} onCheckedChange={(v) => onSave({ type: 'checkbox', value: Boolean(v) })} />
          <Label className="text-sm">{checked ? 'Yes' : 'No'}</Label>
        </div>
      )
    }
    default:
      return (
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Read-only field
        </p>
      )
  }
}

function NumberEditor({ field, value, onSave }: Omit<Props, 'users'>) {
  const current = value.type === 'number' && value.value != null ? String(value.value) : ''
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-1">
      <Input
        autoFocus
        type="number"
        defaultValue={current}
        className="text-right tabular-nums"
        onBlur={(e) => {
          const result = validateNumberInput(field, e.target.value)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setError(null)
          onSave({ type: 'number', value: result.value })
        }}
      />
      {error ? (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

function DateEditor({ field, value, onSave }: Omit<Props, 'users'>) {
  const current = value.type === 'date' ? value.value : null
  const includeTime = asExtendedField(field).includeTime
  return (
    <div className="space-y-2">
      <Calendar
        mode="single"
        selected={current ? parseISODateLocal(current.slice(0, 10)) : undefined}
        onSelect={(d) => onSave({ type: 'date', value: d ? toISODate(d) : null })}
      />
      {includeTime ? (
        <Input
          type="time"
          defaultValue={current?.includes('T') ? current.slice(11, 16) : ''}
          onChange={(e) => {
            if (!current || !e.target.value) return
            const base = current.slice(0, 10)
            onSave({ type: 'date', value: new Date(`${base}T${e.target.value}:00`).toISOString() })
          }}
        />
      ) : null}
      <button
        type="button"
        className="text-xs"
        style={{ color: 'var(--danger)' }}
        onClick={() => onSave({ type: 'date', value: null })}
      >
        Clear
      </button>
    </div>
  )
}

function DropdownEditor({ field, value, onSave }: Omit<Props, 'users'>) {
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto">
      <button
        type="button"
        className="tl-menu-item block w-full rounded-md px-2 py-1.5 text-left text-sm"
        onClick={() => onSave({ type: 'dropdown', value: null })}
      >
        Clear
      </button>
      {field.options?.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className="tl-menu-item flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
          onClick={() => onSave({ type: 'dropdown', value: opt.id })}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: COLOR_TOKENS[opt.color] ?? opt.color }}
          />
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function MultiSelectEditor({ field, value, onSave }: Omit<Props, 'users'>) {
  const selected = value.type === 'multi_select' ? new Set(value.value) : new Set<string>()
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSave({ type: 'multi_select', value: [...next] })
  }
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto">
      {field.options?.map((opt) => (
        <label key={opt.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm">
          <Checkbox checked={selected.has(opt.id)} onCheckedChange={() => toggle(opt.id)} />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

function PeopleEditor({ field, value, users, onSave }: Props) {
  const multi = asExtendedField(field).peopleMulti !== false
  const selected = value.type === 'people' ? new Set(value.value) : new Set<string>()
  const toggle = (id: string) => {
    if (multi) {
      const next = new Set(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSave({ type: 'people', value: [...next] })
    } else {
      onSave({ type: 'people', value: selected.has(id) ? [] : [id] })
    }
  }
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto">
      {users.map((u) => (
        <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm">
          <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
          <span
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-white"
            style={{ background: u.avatarColor }}
          >
            {u.name.slice(0, 1)}
          </span>
          {u.name}
        </label>
      ))}
    </div>
  )
}

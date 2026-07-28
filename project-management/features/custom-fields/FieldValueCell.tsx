'use client'

/** FieldValueCell — read-only custom field value for list/board/detail surfaces. */
import type { CustomField, CustomFieldValue, Task, User } from '../../types'
import { formatDate, timeFromISO } from '../../lib/time'
import { asExtendedField } from '../../lib/customFields/fieldConfig'
import { formatNumberDisplay } from '../../lib/customFields/formatValue'
import { getTaskFieldValue } from '../../lib/customFields/fieldValues'

const COLOR_TOKENS: Record<string, string> = {
  gray: 'var(--ink-muted)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  accent: 'var(--accent)',
  info: 'var(--info)',
  primary: 'var(--primary)',
}

function resolveColor(token: string): string {
  return COLOR_TOKENS[token] ?? token
}

function OptionChip({ label, color }: { label: string; color: string }) {
  const resolved = resolveColor(color)
  return (
    <span
      className="inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${resolved}22`, color: resolved }}
    >
      {label}
    </span>
  )
}

function PeopleAvatars({ ids, users }: { ids: string[]; users: User[] }) {
  const picked = ids.map((id) => users.find((u) => u.id === id)).filter(Boolean) as User[]
  if (!picked.length) return null
  return (
    <span className="inline-flex -space-x-1">
      {picked.slice(0, 3).map((u) => (
        <span
          key={u.id}
          title={u.name}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[9px] text-white"
          style={{ background: u.avatarColor, borderColor: 'var(--bg-elevated)' }}
        >
          {u.name.slice(0, 1)}
        </span>
      ))}
      {picked.length > 3 ? (
        <span className="pl-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
          +{picked.length - 3}
        </span>
      ) : null}
    </span>
  )
}

type Props = {
  field: CustomField
  value?: CustomFieldValue
  task?: Task
  allFields?: CustomField[]
  users?: User[]
  className?: string
}

export function FieldValueCell({ field, value, task, allFields, users = [], className }: Props) {
  const resolved =
    value ?? (task ? getTaskFieldValue(task, field, allFields) : undefined)

  if (!resolved) {
    return (
      <span className={className} style={{ color: 'var(--ink-faint)' }}>
        —
      </span>
    )
  }

  switch (field.type) {
    case 'text':
      if (resolved.type !== 'text' || !resolved.value) {
        return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      }
      return (
        <span className={`truncate text-sm ${className ?? ''}`} title={resolved.value}>
          {resolved.value}
        </span>
      )

    case 'number':
      if (resolved.type !== 'number') {
        return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      }
      return (
        <span className={`block text-right text-sm tabular-nums ${className ?? ''}`}>
          {formatNumberDisplay(field, resolved.value)}
        </span>
      )

    case 'date':
      if (resolved.type !== 'date' || !resolved.value) {
        return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      }
      return (
        <span className={`text-sm ${className ?? ''}`}>
          {formatDate(resolved.value)}
          {asExtendedField(field).includeTime && resolved.value.includes('T')
            ? ` ${timeFromISO(resolved.value)}`
            : ''}
        </span>
      )

    case 'people': {
      if (resolved.type !== 'people' || !resolved.value.length) {
        return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      }
      return <PeopleAvatars ids={resolved.value} users={users} />
    }

    case 'dropdown': {
      if (resolved.type !== 'dropdown' || !resolved.value) {
        return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      }
      const option = field.options?.find((o) => o.id === resolved.value)
      if (!option) return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      return <OptionChip label={option.label} color={option.color} />
    }

    case 'multi_select': {
      if (resolved.type !== 'multi_select' || !resolved.value.length) {
        return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      }
      return (
        <span className={`flex flex-wrap gap-1 ${className ?? ''}`}>
          {resolved.value.map((oid) => {
            const option = field.options?.find((o) => o.id === oid)
            if (!option) return null
            return <OptionChip key={oid} label={option.label} color={option.color} />
          })}
        </span>
      )
    }

    case 'checkbox':
      if (resolved.type !== 'checkbox') {
        return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      }
      return (
        <span
          className={`inline-flex items-center gap-1.5 text-xs ${className ?? ''}`}
          style={{ color: resolved.value ? 'var(--accent)' : 'var(--ink-muted)' }}
        >
          <span
            className="inline-block h-3.5 w-3.5 rounded border"
            style={{
              borderColor: resolved.value ? 'var(--accent)' : 'var(--border-default)',
              background: resolved.value ? 'var(--accent-soft)' : 'transparent',
            }}
            aria-hidden
          />
          {resolved.value ? 'Yes' : 'No'}
        </span>
      )

    case 'formula':
      if (resolved.type !== 'formula' || resolved.value == null) {
        return <span className={className} style={{ color: 'var(--ink-faint)' }}>—</span>
      }
      if (typeof resolved.value === 'string') {
        return (
          <span className={`text-xs ${className ?? ''}`} style={{ color: 'var(--danger)' }} title={resolved.value}>
            Error
          </span>
        )
      }
      return (
        <span className={`block text-right text-sm tabular-nums ${className ?? ''}`} style={{ color: 'var(--ink-secondary)' }}>
          {formatNumberDisplay({ ...field, numberFormat: 'plain' }, resolved.value)}
        </span>
      )

    default:
      return (
        <span className={className} style={{ color: 'var(--ink-muted)' }}>
          —
        </span>
      )
  }
}

'use client'

/**
 * Value editor for a single filter clause (field-type aware).
 */
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FilterClause, FilterFieldDef } from '../../lib/query/types'
import type { FilterContext } from '../../lib/query/filterFields'

type Props = {
  clause: FilterClause
  fieldDef: FilterFieldDef
  ctx: FilterContext
  onChange: (value: unknown) => void
}

export function FilterValueEditor({ clause, fieldDef, ctx, onChange }: Props) {
  if (clause.op === 'is_empty' || clause.op === 'is_not_empty') return null

  if (fieldDef.kind === 'boolean') {
    return (
      <Select value={String(clause.value)} onValueChange={(v) => onChange(v === 'true')}>
        <SelectTrigger className="h-8 w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="z-[100]">
          <SelectItem value="true">Yes</SelectItem>
          <SelectItem value="false">No</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  if (fieldDef.kind === 'user') {
    return (
      <Select value={String(clause.value ?? '')} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[140px]">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent className="z-[100]">
          <SelectItem value="__me__">Me</SelectItem>
          {ctx.members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (fieldDef.kind === 'section') {
    return (
      <Select value={String(clause.value ?? '')} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[140px]">
          <SelectValue placeholder="Section…" />
        </SelectTrigger>
        <SelectContent className="z-[100]">
          {ctx.sections.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (fieldDef.kind === 'date' && clause.field === 'dueOn') {
    return (
      <Select value={String(clause.value ?? '')} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[140px]">
          <SelectValue placeholder="Due…" />
        </SelectTrigger>
        <SelectContent className="z-[100]">
          <SelectItem value="__overdue__">Overdue</SelectItem>
          <SelectItem value="__today__">Today</SelectItem>
          <SelectItem value="__this_week__">This week</SelectItem>
          <SelectItem value="__no_date__">No date</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  if (fieldDef.kind === 'date') {
    return (
      <Input
        type="date"
        className="h-8 w-[150px]"
        value={String(clause.value ?? '')}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (fieldDef.kind === 'enum') {
    const cf = ctx.customFields.find((f) => f.id === fieldDef.customFieldId)
    return (
      <Select value={String(clause.value ?? '')} onValueChange={onChange}>
        <SelectTrigger className="h-8 min-w-[140px]">
          <SelectValue placeholder="Option…" />
        </SelectTrigger>
        <SelectContent className="z-[100]">
          {cf?.options?.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <Input
      className="h-8 min-w-[120px] flex-1"
      value={String(clause.value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Value…"
    />
  )
}

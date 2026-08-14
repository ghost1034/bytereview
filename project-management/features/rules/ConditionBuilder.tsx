'use client'

/** Condition builder — AND-only filter rows on task fields. */
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CustomField, Rule, Section, Tag, User } from '../../types'
import { buildFilterFields, operatorsForField } from '../../lib/query/filterFields'
import { FilterValueEditor } from '../query/FilterValueEditor'

type Condition = Rule['conditions'][number]

type Props = {
  conditions: Condition[]
  onChange: (conditions: Condition[]) => void
  customFields: CustomField[]
  members: User[]
  sections: Section[]
  tags: Tag[]
}

const RULE_OPS = ['eq', 'neq', 'gt', 'lt', 'in'] as const

export function ConditionBuilder({
  conditions,
  onChange,
  customFields,
  members,
  sections,
  tags,
}: Props) {
  const fieldDefs = buildFilterFields(customFields)
  const ctx = { members, sections, tags, customFields }

  const addRow = () => {
    const field = fieldDefs[0]
    const op = RULE_OPS.find((o) => operatorsForField(field).includes(o)) ?? 'eq'
    onChange([...conditions, { field: field.id, op, value: '' }])
  }

  const updateRow = (index: number, patch: Partial<Condition>) => {
    onChange(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <Label>Conditions (optional, AND)</Label>
        <Button type="button" variant="ghost" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {conditions.length === 0 ? (
        <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>No conditions — rule runs for every matching trigger.</p>
      ) : (
        conditions.map((clause, index) => {
          const fieldDef = fieldDefs.find((f) => f.id === clause.field) ?? fieldDefs[0]
          const ops = operatorsForField(fieldDef).filter((o): o is Condition['op'] =>
            (RULE_OPS as readonly string[]).includes(o)
          )
          return (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Select
                value={clause.field}
                onValueChange={(field) => {
                  const def = fieldDefs.find((f) => f.id === field) ?? fieldDefs[0]
                  const op = RULE_OPS.find((o) => operatorsForField(def).includes(o)) ?? 'eq'
                  updateRow(index, { field, op, value: '' })
                }}
              >
                <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  {fieldDefs.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={clause.op}
                onValueChange={(op) => updateRow(index, { op: op as Condition['op'] })}
              >
                <SelectTrigger className="h-8 w-[90px]"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[100]">
                  {ops.map((op) => (
                    <SelectItem key={op} value={op}>{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FilterValueEditor
                clause={{ field: clause.field, op: clause.op, value: clause.value }}
                fieldDef={fieldDef}
                ctx={ctx}
                onChange={(value) => updateRow(index, { value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onChange(conditions.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        })
      )}
    </div>
  )
}

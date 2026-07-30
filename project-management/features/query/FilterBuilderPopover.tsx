'use client'

/**
 * Filter builder popover — add/remove clauses with field, operator, and value editors.
 */
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger } from '@/components/ui/popover'
import { TasklyticPopoverContent } from '../ui/TasklyticPopoverContent'
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TasklyticSelectContent } from '../ui/TasklyticSelectContent'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import type { CustomField, Section, Tag, User } from '../../types'
import type { FilterClause, FilterFieldDef } from '../../lib/query/types'
import { buildFilterFields, operatorsForField, type FilterContext } from '../../lib/query/filterFields'
import { isQuickFilterActive, quickFiltersConfig, toggleQuickFilter } from './quickFiltersConfig'
import { FilterValueEditor } from './FilterValueEditor'

type Props = {
  filters: FilterClause[]
  onChange: (filters: FilterClause[]) => void
  customFields?: CustomField[]
  members?: User[]
  sections?: Section[]
  tags?: Tag[]
  trigger: React.ReactNode
}

function defaultValueForField(field: FilterFieldDef): unknown {
  if (field.kind === 'boolean') return false
  if (field.kind === 'tags' || field.kind === 'users') return []
  return ''
}

export function FilterBuilderPopover({
  filters,
  onChange,
  customFields = [],
  members = [],
  sections = [],
  tags = [],
  trigger,
}: Props) {
  const fieldDefs = buildFilterFields(customFields)
  const ctx: FilterContext = { members, sections, tags, customFields }

  const addFilter = () => {
    const field = fieldDefs[0]
    onChange([...filters, { field: field.id, op: operatorsForField(field)[0], value: defaultValueForField(field) }])
  }

  const updateClause = (index: number, patch: Partial<FilterClause>) => {
    onChange(filters.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  const removeClause = (index: number) => onChange(filters.filter((_, i) => i !== index))

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <TasklyticPopoverContent align="start" className="w-[520px] p-0">
        <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
            Quick filters
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quickFiltersConfig.map((preset) => (
              <Badge
                key={preset.id}
                variant={isQuickFilterActive(filters, preset) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => onChange(toggleQuickFilter(filters, preset))}
              >
                {preset.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto px-3 py-2">
          <p className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }} title="OR groups coming soon">
            All conditions (AND) · OR coming soon
          </p>
          {filters.length === 0 ? (
            <p className="py-4 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
              No filters applied
            </p>
          ) : (
            filters.map((clause, index) => {
              const fieldDef = fieldDefs.find((f) => f.id === clause.field) ?? fieldDefs[0]
              const ops = operatorsForField(fieldDef)
              return (
                <div key={`${clause.field}-${index}`} className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Select
                    value={clause.field}
                    onValueChange={(field) => {
                      const def = fieldDefs.find((f) => f.id === field) ?? fieldDefs[0]
                      updateClause(index, {
                        field,
                        op: operatorsForField(def)[0],
                        value: defaultValueForField(def),
                      })
                    }}
                  >
                    <SelectTrigger className="h-8 w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <TasklyticSelectContent>
                      {fieldDefs.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </TasklyticSelectContent>
                  </Select>
                  <Select value={clause.op} onValueChange={(op) => updateClause(index, { op: op as FilterClause['op'] })}>
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <TasklyticSelectContent>
                      {ops.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </TasklyticSelectContent>
                  </Select>
                  <FilterValueEditor
                    clause={clause}
                    fieldDef={fieldDef}
                    ctx={ctx}
                    onChange={(value) => updateClause(index, { value })}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeClause(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })
          )}
        </div>

        <Separator />
        <div className="flex items-center justify-between px-3 py-2">
          <Button variant="ghost" size="sm" onClick={addFilter}>
            <Plus className="mr-1 h-4 w-4" /> Add filter
          </Button>
          {filters.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear all
            </Button>
          ) : null}
        </div>
      </TasklyticPopoverContent>
    </Popover>
  )
}

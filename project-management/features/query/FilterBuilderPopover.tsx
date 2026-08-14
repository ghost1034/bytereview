'use client'

/**
 * Filter builder popover — add/remove clauses with field, operator, and value editors.
 */
import { Braces, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PopoverContent, Popover, PopoverTrigger } from '@/components/ui/popover'
import {
  SelectContent,
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import type { CustomField, Section, Tag, User } from '../../types'
import type { FilterClause, FilterExpression, FilterFieldDef, FilterGroup } from '../../lib/query/types'
import {
  clauseCount,
  isFilterGroup,
  newFilterExpressionId,
  removeFilterExpression,
  updateFilterExpression,
} from '../../lib/query/filterExpression'
import { buildFilterFields, operatorsForField, type FilterContext } from '../../lib/query/filterFields'
import { isQuickFilterActive, quickFiltersConfig, toggleQuickFilter } from './quickFiltersConfig'
import { FilterValueEditor } from './FilterValueEditor'

type Props = {
  expression: FilterGroup
  onChange: (expression: FilterGroup) => void
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
  expression,
  onChange,
  customFields = [],
  members = [],
  sections = [],
  tags = [],
  trigger,
}: Props) {
  const fieldDefs = buildFilterFields(customFields)
  const ctx: FilterContext = { members, sections, tags, customFields }

  const rootClauses = expression.children.filter((node): node is FilterClause => !isFilterGroup(node))

  const addFilter = (groupId = expression.id) => {
    const field = fieldDefs[0]
    const clause: FilterClause = {
      type: 'clause',
      id: newFilterExpressionId('clause'),
      field: field.id,
      op: operatorsForField(field)[0],
      value: defaultValueForField(field),
    }
    onChange(updateFilterExpression(expression, groupId ?? '', (node) =>
      isFilterGroup(node) ? { ...node, children: [...node.children, clause] } : node
    ) as FilterGroup)
  }

  const addGroup = (groupId = expression.id) => {
    const group: FilterGroup = {
      type: 'group',
      id: newFilterExpressionId('group'),
      operator: 'and',
      children: [],
    }
    onChange(updateFilterExpression(expression, groupId ?? '', (node) =>
      isFilterGroup(node) ? { ...node, children: [...node.children, group] } : node
    ) as FilterGroup)
  }

  const updateNode = (id: string, updater: (node: FilterExpression) => FilterExpression) =>
    onChange(updateFilterExpression(expression, id, updater) as FilterGroup)

  const removeNode = (id: string) => onChange(removeFilterExpression(expression, id))

  const toggleQuick = (preset: (typeof quickFiltersConfig)[number]) => {
    const next = toggleQuickFilter(rootClauses, preset)
    onChange({ ...expression, children: [...expression.children.filter(isFilterGroup), ...next] })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[520px] p-0">
        <div className="border-b px-3 py-2" style={{ borderColor: 'hsl(var(--border))' }}>
          <p className="text-xs font-medium" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Quick filters
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quickFiltersConfig.map((preset) => (
              <Badge
                key={preset.id}
                variant={isQuickFilterActive(rootClauses, preset) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleQuick(preset)}
              >
                {preset.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto px-3 py-2">
          <p className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Recursive filter groups · {clauseCount(expression)} condition(s)
          </p>
          {expression.children.length === 0 ? (
            <p className="py-4 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              No filters applied
            </p>
          ) : (
            <FilterGroupEditor
              group={expression}
              root
              fieldDefs={fieldDefs}
              ctx={ctx}
              onUpdate={updateNode}
              onRemove={removeNode}
              onAddClause={addFilter}
              onAddGroup={addGroup}
            />
          )}
        </div>

        <Separator />
        <div className="flex items-center justify-between px-3 py-2">
          <Button variant="ghost" size="sm" onClick={() => addFilter()}>
            <Plus className="mr-1 h-4 w-4" /> Add filter
          </Button>
          <Button variant="ghost" size="sm" aria-label="Add filter group" onClick={() => addGroup()}>
            <Plus className="mr-1 h-4 w-4" /> Add group
          </Button>
          {expression.children.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onChange({ ...expression, children: [] })}>
              Clear all
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type GroupEditorProps = {
  group: FilterGroup
  root?: boolean
  fieldDefs: FilterFieldDef[]
  ctx: FilterContext
  onUpdate: (id: string, updater: (node: FilterExpression) => FilterExpression) => void
  onRemove: (id: string) => void
  onAddClause: (groupId?: string) => void
  onAddGroup: (groupId?: string) => void
}

function FilterGroupEditor({ group, root, fieldDefs, ctx, onUpdate, onRemove, onAddClause, onAddGroup }: GroupEditorProps) {
  return (
    <div className={root ? 'space-y-2' : 'ml-3 space-y-2 rounded-lg border p-2'} style={!root ? { borderColor: 'hsl(var(--border))' } : undefined}>
      <div className="flex items-center gap-1.5">
        <Braces className="h-3.5 w-3.5" style={{ color: 'hsl(var(--foreground-muted))' }} />
        <Select value={group.operator} onValueChange={(operator) => onUpdate(group.id ?? '', (node) => isFilterGroup(node) ? { ...node, operator: operator as 'and' | 'or' } : node)}>
          <SelectTrigger className="h-7 w-24 text-xs" aria-label={root ? 'Root filter operator' : 'Filter group operator'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="and">All (AND)</SelectItem>
            <SelectItem value="or">Any (OR)</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-7 text-xs" aria-label="Add filter condition" onClick={() => onAddClause(group.id)}><Plus className="mr-1 h-3 w-3" />Condition</Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" aria-label="Add filter group" onClick={() => onAddGroup(group.id)}><Plus className="mr-1 h-3 w-3" />Group</Button>
        {!root ? <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label="Remove filter group" onClick={() => onRemove(group.id ?? '')}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
      </div>
      {group.children.map((node) => isFilterGroup(node) ? (
        <FilterGroupEditor key={node.id} group={node} fieldDefs={fieldDefs} ctx={ctx} onUpdate={onUpdate} onRemove={onRemove} onAddClause={onAddClause} onAddGroup={onAddGroup} />
      ) : (
        <FilterClauseEditor key={node.id} clause={node} fieldDefs={fieldDefs} ctx={ctx} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </div>
  )
}

function FilterClauseEditor({ clause, fieldDefs, ctx, onUpdate, onRemove }: Pick<GroupEditorProps, 'fieldDefs' | 'ctx' | 'onUpdate' | 'onRemove'> & { clause: FilterClause }) {
  const fieldDef = fieldDefs.find((field) => field.id === clause.field) ?? fieldDefs[0]
  const ops = operatorsForField(fieldDef)
  const patch = (next: Partial<FilterClause>) => onUpdate(clause.id ?? '', (node) => isFilterGroup(node) ? node : { ...node, ...next })
  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-3">
      <Select value={clause.field} onValueChange={(field) => {
        const def = fieldDefs.find((item) => item.id === field) ?? fieldDefs[0]
        patch({ field, op: operatorsForField(def)[0], value: defaultValueForField(def) })
      }}>
        <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
        <SelectContent>{fieldDefs.map((field) => <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={clause.op} onValueChange={(op) => patch({ op: op as FilterClause['op'] })}>
        <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
        <SelectContent>{ops.map((op) => <SelectItem key={op} value={op}>{op.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
      </Select>
      <FilterValueEditor clause={clause} fieldDef={fieldDef} ctx={ctx} onChange={(value) => patch({ value })} />
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove filter" onClick={() => onRemove(clause.id ?? '')}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>
  )
}

'use client'

/**
 * Single-field sort menu with direction toggle.
 */
import { ArrowDownAZ, ArrowUpAZ } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CustomField } from '../../types'
import { SORT_FIELD_OPTIONS, resolveSort, type ViewQuery } from '../../lib/query/applyQuery'

type Props = {
  query: ViewQuery
  onChange: (query: ViewQuery) => void
  customFields?: CustomField[]
}

export function SortMenu({ query, onChange, customFields = [] }: Props) {
  const current = resolveSort(query)
  const sortableCustom = customFields.filter((f) =>
    ['number', 'date', 'dropdown', 'text'].includes(f.type)
  )
  const currentLabel =
    SORT_FIELD_OPTIONS.find((s) => s.field === current?.field)?.label ??
    sortableCustom.find((f) => `customField:${f.id}` === current?.field)?.name ??
    (current ? current.field : 'None')

  const pickSort = (field: string) => {
    const same = current?.field === field
    const direction = same && current?.direction === 'asc' ? 'desc' : 'asc'
    onChange({ ...query, sortBy: { field, direction }, sort: { field, direction } })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {current?.direction === 'desc' ? (
            <ArrowDownAZ className="mr-1 h-4 w-4" />
          ) : (
            <ArrowUpAZ className="mr-1 h-4 w-4" />
          )}
          Sort: {currentLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="tl-popover-surface" align="start">
        {SORT_FIELD_OPTIONS.map((s) => (
          <DropdownMenuItem key={s.field} onClick={() => pickSort(s.field)}>
            {s.label}
            {current?.field === s.field ? ` (${current.direction})` : ''}
          </DropdownMenuItem>
        ))}
        {sortableCustom.map((f) => (
          <DropdownMenuItem key={f.id} onClick={() => pickSort(`customField:${f.id}`)}>
            {f.name}
            {current?.field === `customField:${f.id}` ? ` (${current.direction})` : ''}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onChange({ ...query, sortBy: undefined, sort: undefined })}>
          None (manual)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

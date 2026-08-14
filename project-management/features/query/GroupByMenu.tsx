'use client'

/**
 * Group-by dropdown for view rendering.
 */
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CustomField } from '../../types'
import { GROUP_BY_OPTIONS, type GroupingKey, type ViewQuery } from '../../lib/query/applyQuery'

type Props = {
  query: ViewQuery
  onChange: (query: ViewQuery) => void
  customFields?: CustomField[]
}

export function GroupByMenu({ query, onChange, customFields = [] }: Props) {
  const groupableCustom = customFields.filter((f) =>
    ['dropdown', 'multi_select', 'text', 'number'].includes(f.type)
  )
  const currentLabel =
    GROUP_BY_OPTIONS.find((g) => g.key === query.groupBy)?.label ??
    groupableCustom.find((f) => query.groupBy === `customField:${f.id}`)?.name ??
    'None'

  const pick = (key: GroupingKey) => onChange({ ...query, groupBy: key === 'none' ? undefined : key })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Layers className="mr-1 h-4 w-4" />
          Group: {currentLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {GROUP_BY_OPTIONS.map((g) => (
          <DropdownMenuItem key={g.key} onClick={() => pick(g.key)}>
            {g.label}
          </DropdownMenuItem>
        ))}
        {groupableCustom.map((f) => (
          <DropdownMenuItem key={f.id} onClick={() => pick(`customField:${f.id}`)}>
            {f.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

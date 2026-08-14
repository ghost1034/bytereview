'use client'

/**
 * Customize menu — hide fields, density, show completed toggle.
 */
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LIST_HIDEABLE_FIELDS, resolvesShowCompleted, type ViewQuery } from '../../lib/query/applyQuery'

type Props = {
  query: ViewQuery
  onChange: (query: ViewQuery) => void
  showDensity?: boolean
  showHideFields?: boolean
}

export function CustomizeMenu({ query, onChange, showDensity = true, showHideFields = true }: Props) {
  const showCompleted = resolvesShowCompleted(query)

  const toggleHiddenField = (fieldId: string) => {
    const hidden = new Set(query.hiddenFields)
    if (hidden.has(fieldId)) hidden.delete(fieldId)
    else hidden.add(fieldId)
    onChange({ ...query, hiddenFields: [...hidden] })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-1 h-4 w-4" />
          Customize
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Display</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={showCompleted}
          onCheckedChange={(checked) =>
            onChange({ ...query, showCompleted: !!checked, hiddenCompleted: !checked })
          }
        >
          Show completed
        </DropdownMenuCheckboxItem>

        {showDensity ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Density</DropdownMenuLabel>
            {(['compact', 'comfortable', 'detailed'] as const).map((d) => (
              <DropdownMenuCheckboxItem
                key={d}
                checked={query.density === d}
                onCheckedChange={() => onChange({ ...query, density: d })}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}

        {showHideFields ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Hide fields</DropdownMenuLabel>
            {LIST_HIDEABLE_FIELDS.map((f) => (
              <DropdownMenuCheckboxItem
                key={f.id}
                checked={query.hiddenFields.includes(f.id)}
                onCheckedChange={() => toggleHiddenField(f.id)}
              >
                {f.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

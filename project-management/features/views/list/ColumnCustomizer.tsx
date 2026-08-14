'use client'

/**
 * ColumnCustomizer — show/hide and reset list columns (persisted per user × project).
 */
import { Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useColumnsStore, type ColumnDef, type ListColumnId } from '../../../stores/columns'

type Props = {
  userId: string | null
  projectId: string
  columns: ColumnDef[]
}

/** Dropdown to toggle column visibility and reset layout. */
export function ColumnCustomizer({ userId, projectId, columns }: Props) {
  const toggleColumn = useColumnsStore((s) => s.toggleVisibility)
  const resetColumns = useColumnsStore((s) => s.reset)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="mr-1 h-4 w-4" />
          Customize
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        {columns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            checked={col.visible}
            disabled={col.id === 'name'}
            onCheckedChange={() => toggleColumn(userId, projectId, col.id as ListColumnId)}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => resetColumns(userId, projectId)}>Reset columns</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

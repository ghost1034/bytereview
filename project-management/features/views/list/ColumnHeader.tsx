'use client'

/**
 * ColumnHeader — sticky grid header with drag-reorder and resize handles.
 */
import { useRef } from 'react'
import { GripVertical } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { useColumnsStore, type ColumnDef, type ListColumnId } from '../../../stores/columns'

type Props = {
  userId: string | null
  projectId: string
  columns: ColumnDef[]
  gridTemplate: string
  allTaskIds: string[]
  selected: Set<string>
  onToggleAll: () => void
}

/** Sticky column header row with resize and reorder. */
export function ColumnHeader({
  userId,
  projectId,
  columns,
  gridTemplate,
  allTaskIds,
  selected,
  onToggleAll,
}: Props) {
  const visible = columns.filter((c) => c.visible)
  const setWidth = useColumnsStore((s) => s.setWidth)
  const reorder = useColumnsStore((s) => s.reorder)
  const dragCol = useRef<number | null>(null)

  const allSelected = allTaskIds.length > 0 && allTaskIds.every((id) => selected.has(id))
  const someSelected = allTaskIds.some((id) => selected.has(id))
  const checkState = allSelected ? true : someSelected ? 'indeterminate' : false

  const onResizeStart = (colId: ListColumnId, startX: number, startWidth: number) => {
    const onMove = (e: MouseEvent) => {
      setWidth(userId, projectId, colId, startWidth + (e.clientX - startX))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className="sticky top-0 z-30 grid items-center border-b text-[10px] font-semibold uppercase tracking-wide"
      style={{
        gridTemplateColumns: gridTemplate,
        height: 36,
        background: 'hsl(var(--surface-muted))',
        color: 'hsl(var(--foreground-muted))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      <div className="flex items-center justify-center px-1">
        <Checkbox
          className=""
          checked={checkState}
          onClick={(e) => {
            e.stopPropagation()
            onToggleAll()
          }}
          aria-label="Select all tasks"
        />
      </div>
      <div className="flex shrink-0 items-center justify-center px-0.5">
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide">
          Complete
        </span>
      </div>
      {visible.map((col, idx) => {
        const fullIdx = columns.findIndex((c) => c.id === col.id)
        return (
          <div
            key={col.id}
            className="relative flex min-w-0 items-center gap-1 truncate px-2"
            draggable
            onDragStart={() => {
              dragCol.current = fullIdx
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragCol.current === null || dragCol.current === fullIdx) return
              reorder(userId, projectId, dragCol.current, fullIdx)
              dragCol.current = null
            }}
          >
            <GripVertical className="h-3 w-3 shrink-0 opacity-40" />
            <span className="truncate">{col.label}</span>
            <button
              type="button"
              aria-label={`Resize ${col.label}`}
              className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[hsl(var(--primary))]"
              onMouseDown={(e) => {
                e.preventDefault()
                onResizeStart(col.id as ListColumnId, e.clientX, col.width)
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

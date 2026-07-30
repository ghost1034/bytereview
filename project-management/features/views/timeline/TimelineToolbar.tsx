'use client'

/**
 * Timeline-specific toolbar — zoom, rows/color, dependency toggles.
 */
import { ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ZOOM_LABELS, ZOOM_LEVELS } from './constants'
import type { ColorBy, RowsBy, ZoomLevel } from './types'

type Props = {
  zoom: ZoomLevel
  onZoom: (z: ZoomLevel) => void
  onZoomIn: () => void
  onZoomOut: () => void
  colorBy: ColorBy
  onColorBy: (c: ColorBy) => void
  rowsBy: RowsBy
  onRowsBy: (r: RowsBy) => void
  autoShift: boolean
  onAutoShift: (v: boolean) => void
  highlightCriticalPath: boolean
  onHighlightCriticalPath: (v: boolean) => void
  showRowsBy?: boolean
  linkError?: string | null
  extra?: React.ReactNode
}

export function TimelineToolbar({
  zoom,
  onZoom,
  onZoomIn,
  onZoomOut,
  colorBy,
  onColorBy,
  rowsBy,
  onRowsBy,
  autoShift,
  onAutoShift,
  highlightCriticalPath,
  onHighlightCriticalPath,
  showRowsBy = true,
  linkError,
  extra,
}: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onZoomOut} aria-label="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Select value={zoom} onValueChange={(v) => onZoom(v as ZoomLevel)}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            {ZOOM_LEVELS.map((z) => (
              <SelectItem key={z} value={z}>
                {ZOOM_LABELS[z]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onZoomIn} aria-label="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {showRowsBy ? (
        <Select value={rowsBy} onValueChange={(v) => onRowsBy(v as RowsBy)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Rows by" />
          </SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">
            <SelectItem value="none">Flat list</SelectItem>
            <SelectItem value="section">Section</SelectItem>
            <SelectItem value="assignee">Assignee</SelectItem>
            <SelectItem value="tag">Tag</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      <Select value={colorBy} onValueChange={(v) => onColorBy(v as ColorBy)}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="Color by" />
        </SelectTrigger>
        <SelectContent className="tl-popover-surface z-[100]">
          <SelectItem value="section">Section</SelectItem>
          <SelectItem value="assignee">Assignee</SelectItem>
          <SelectItem value="tag">Tag</SelectItem>
          <SelectItem value="priority">Priority</SelectItem>
        </SelectContent>
      </Select>

      <div
        className="flex items-center gap-2 rounded-md border px-2 py-1"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
        title="When on, dragging a predecessor bar later also moves its dependents. Turning on runs a one-time align for any overlapping dates."
      >
        <Switch id="auto-shift" className="tl-switch" checked={autoShift} onCheckedChange={onAutoShift} />
        <Label htmlFor="auto-shift" className="cursor-pointer text-xs" style={{ color: 'var(--ink-secondary)' }}>
          Auto-shift when dragging
        </Label>
      </div>

      <div className="flex items-center gap-2 rounded-md border px-2 py-1" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
        <Switch id="crit-path" className="tl-switch" checked={highlightCriticalPath} onCheckedChange={onHighlightCriticalPath} />
        <Label htmlFor="crit-path" className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
          Highlight critical path
        </Label>
      </div>

      {extra}

      {linkError ? (
        <span className="text-xs" style={{ color: 'var(--danger)' }} title={linkError}>
          {linkError}
        </span>
      ) : null}
    </div>
  )
}

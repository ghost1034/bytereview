'use client'

/**
 * SVG finish-to-start dependency arrows with hover and context menu removal.
 */
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { CRITICAL_PATH_COLOR, CRITICAL_PATH_GLOW } from './constants'

type Arrow = {
  fromId: string
  toId: string
  path: string
  conflict?: boolean
}

type Props = {
  arrows: Arrow[]
  criticalIds: Set<string>
  hoveredEdge: string | null
  setHoveredEdge: (key: string | null) => void
  onRemove: (fromId: string, toId: string) => void
  width: number
  height: number
}

export function DependencyArrow({
  arrows,
  criticalIds,
  hoveredEdge,
  setHoveredEdge,
  onRemove,
  width,
  height,
}: Props) {
  return (
    <svg className="pointer-events-none absolute inset-0 z-[4]" width={width} height={height} aria-hidden>
      <defs>
        <marker id="tl-dep-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--ink-muted)" />
        </marker>
        <marker id="tl-dep-arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={CRITICAL_PATH_COLOR} />
        </marker>
        <marker id="tl-dep-arrow-warn" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--danger)" />
        </marker>
      </defs>
      {arrows.map(({ fromId, toId, path, conflict }) => {
        const key = `${fromId}-${toId}`
        const critical = !conflict && criticalIds.has(fromId) && criticalIds.has(toId)
        const hovered = hoveredEdge === key
        const stroke = conflict
          ? 'var(--danger)'
          : critical
            ? CRITICAL_PATH_COLOR
            : hovered
              ? 'var(--primary)'
              : 'var(--ink-muted)'
        const strokeWidth = conflict ? 2 : critical ? 3 : hovered ? 2 : 1.5
        const markerEnd = conflict
          ? 'url(#tl-dep-arrow-warn)'
          : critical
            ? 'url(#tl-dep-arrow-crit)'
            : 'url(#tl-dep-arrow)'

        return (
          <ContextMenu key={key}>
            <ContextMenuTrigger asChild>
              <g
                className="pointer-events-auto cursor-pointer"
                onMouseEnter={() => setHoveredEdge(key)}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                <path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={conflict ? '5 4' : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={
                    critical
                      ? { filter: `drop-shadow(0 0 3px ${CRITICAL_PATH_GLOW})` }
                      : undefined
                  }
                  markerEnd={markerEnd}
                >
                  <title>
                    {conflict
                      ? 'Schedule conflict: dependent starts before predecessor finishes'
                      : 'Finish-to-start dependency'}
                  </title>
                </path>
                <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
              </g>
            </ContextMenuTrigger>
            <ContextMenuContent className="tl-popover-surface">
              <ContextMenuItem onClick={() => onRemove(fromId, toId)}>Remove dependency</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </svg>
  )
}

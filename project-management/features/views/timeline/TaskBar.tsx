'use client'

/**
 * Draggable task bar with resize handles and dependency link knob.
 */
import { useState } from 'react'
import { Check } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDate } from '../../../lib/time'
import type { Task, User } from '../../../types'
import { CRITICAL_PATH_COLOR, CRITICAL_PATH_GLOW, ROW_H } from './constants'
import type { DragMode } from './useTimelineDnd'

type Props = {
  task: Task
  left: number
  width: number
  rowTop: number
  color: string
  critical: boolean
  assignee?: User
  linkActive: boolean
  linking: boolean
  onOpen: () => void
  onPointerDown: (e: React.PointerEvent, mode: DragMode) => void
  onLinkTargetEnter?: () => void
}

export function TaskBar({
  task,
  left,
  width,
  rowTop,
  color,
  critical,
  assignee,
  linkActive,
  linking,
  onOpen,
  onPointerDown,
  onLinkTargetEnter,
}: Props) {
  const [hover, setHover] = useState(false)
  const overdue = Boolean(task.dueOn && !task.completed && new Date(task.dueOn) < new Date())

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute z-[6]"
            style={{ left, top: rowTop + 6, width, height: ROW_H - 12 }}
            onMouseEnter={() => {
              setHover(true)
              if (linking) onLinkTargetEnter?.()
            }}
            onMouseLeave={() => setHover(false)}
          >
            <div
              className="relative h-full cursor-grab rounded active:cursor-grabbing"
              style={{
                background: color,
                opacity: task.completed ? 0.55 : 1,
                outline: critical ? `2px solid ${CRITICAL_PATH_COLOR}` : undefined,
                outlineOffset: critical ? 1 : undefined,
                boxShadow: critical
                  ? `0 0 0 1px ${CRITICAL_PATH_COLOR}, 0 0 10px ${CRITICAL_PATH_GLOW}`
                  : undefined,
                border: overdue && !critical ? '1px solid var(--danger)' : undefined,
              }}
              onPointerDown={(e) => onPointerDown(e, 'move')}
              onDoubleClick={onOpen}
            >
              {critical ? (
                <span
                  className="absolute -left-2 top-1/2 z-[1] h-3 w-3 -translate-y-1/2 rounded-full ring-2 ring-white"
                  style={{ background: CRITICAL_PATH_COLOR, boxShadow: `0 0 6px ${CRITICAL_PATH_GLOW}` }}
                  aria-hidden
                />
              ) : null}
              <div
                className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize rounded-l"
                style={{ background: hover ? 'rgba(255,255,255,0.35)' : 'transparent' }}
                onPointerDown={(e) => onPointerDown(e, 'resize-start')}
              />
              <div
                className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize rounded-r"
                style={{ background: hover ? 'rgba(255,255,255,0.35)' : 'transparent' }}
                onPointerDown={(e) => onPointerDown(e, 'resize-end')}
              />
              {hover ? (
                <button
                  type="button"
                  className="absolute -right-2 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full text-[10px]"
                  style={{
                    background: linkActive ? 'var(--primary)' : 'var(--bg-elevated)',
                    color: linkActive ? 'var(--ink-inverse)' : 'var(--ink-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  onPointerDown={(e) => onPointerDown(e, 'link')}
                  aria-label="Drag to create dependency"
                >
                  →
                </button>
              ) : null}
              <span className="flex h-full items-center gap-1 truncate px-2 text-[11px] text-white">
                {task.completed ? <Check className="h-3 w-3 shrink-0" /> : null}
                {width > 48 ? task.name : null}
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="tl-popover-surface text-xs">
          <p className="font-medium">{task.name}</p>
          {task.startOn ? <p>Start: {formatDate(task.startOn)}</p> : null}
          {task.dueOn ? <p>Due: {formatDate(task.dueOn)}</p> : null}
          {assignee ? <p>{assignee.name}</p> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

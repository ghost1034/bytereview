'use client'

/** BoardDragPreview — static card clone for drag overlay (no sortable hooks). */
import type { CustomField, Tag, Task, User } from '../../../types'
import { formatDate } from '../../../lib/time'
import { UserAvatar } from '../../profile/UserAvatar'
import { coverColorFromTags, dueChipStyle } from './boardUtils'

type Props = {
  task: Task
  tags: Tag[]
  density: 'compact' | 'comfortable'
}

export function BoardDragPreview({ task, tags, density }: Props) {
  const compact = density === 'compact'
  const cover = coverColorFromTags(task, tags)
  const dueStyle = dueChipStyle(task.dueOn)

  return (
    <div className={`rounded-lg border border-border bg-card text-card-foreground shadow-md ${compact ? 'p-2' : 'p-3'}`}>
      {cover ? (
        <div className="-mx-3 -mt-3 mb-2 h-1 rounded-t-xl" style={{ background: cover }} />
      ) : null}
      <p className={`font-medium line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}>{task.name}</p>
      <div className={`flex items-center justify-between gap-2 ${compact ? 'mt-1' : 'mt-2'}`}>
        {task.assigneeId ? (
          <UserAvatar userId={task.assigneeId} size="sm" showPresence={false} />
        ) : (
          <span className="text-[10px]" style={{ color: 'hsl(var(--foreground-subtle))' }}>
            +
          </span>
        )}
        {task.dueOn ? (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={dueStyle}
          >
            {formatDate(task.dueOn)}
          </span>
        ) : null}
      </div>
    </div>
  )
}

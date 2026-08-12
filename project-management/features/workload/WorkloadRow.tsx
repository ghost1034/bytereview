'use client'

/** Single person row in the workload grid. */
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { formatHours, userWeeklyCapacity } from '../../lib/workload'
import type { TimeBucket } from '../../lib/workload/buckets'
import type { WorkloadPersonRow } from '../../lib/workload/matrix'
import { CapacityCell } from './CapacityCell'
import { bucketHasTimeOff, TimeOffBand } from './TimeOffBand'

type Props = {
  row: WorkloadPersonRow
  buckets: TimeBucket[]
  onCellClick: (userId: string, bucketKey: string) => void
  onDropTaskOnCell?: (userId: string, bucketKey: string, taskId: string) => void
  onDropTaskOnRow?: (userId: string, taskId: string) => void
  onPersonClick?: (userId: string) => void
}

/** Person header, utilization bar, and capacity cells. */
export function WorkloadRow({
  row,
  buckets,
  onCellClick,
  onDropTaskOnCell,
  onDropTaskOnRow,
  onPersonClick,
}: Props) {
  const weeklyCap = userWeeklyCapacity(row.user)
  const barValue = Math.min(100, row.utilizationPercent)

  return (
    <tr
      className="border-b last:border-0"
      style={{ borderColor: 'var(--border-subtle)' }}
      onDragOver={(e) => {
        if (onDropTaskOnRow) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        const taskId = e.dataTransfer.getData('text/task-id')
        if (taskId && onDropTaskOnRow) onDropTaskOnRow(row.userId, taskId)
      }}
    >
      <td className="sticky left-0 z-10 min-w-[200px] bg-[var(--bg-elevated)] px-3 py-2">
        <div className="flex items-start gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback
              className="text-xs font-medium text-white"
              style={{ background: row.user?.avatarColor ?? 'var(--ink-muted)' }}
            >
              {initials(row.label)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <button type="button" className="truncate text-left text-sm font-medium hover:underline" onClick={() => onPersonClick?.(row.userId)}>{row.label}</button>
            <p className="text-xs tabular-nums" style={{ color: 'var(--ink-muted)' }}>
              {formatHours(row.weekTotalHours)} / {formatHours(weeklyCap)} · {row.overloadBucketCount} overload
            </p>
            <Progress value={barValue} className="mt-1 h-1.5" />
            {row.utilizationPercent > 100 ? (
              <Badge variant="outline" className="mt-1 text-[10px]" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                {row.utilizationPercent}%
              </Badge>
            ) : (
              <span className="mt-1 block text-[10px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                {row.utilizationPercent}% utilized
              </span>
            )}
          </div>
        </div>
      </td>
      {buckets.map((bucket) => {
        const cell = row.cells[bucket.key]
        const off = bucketHasTimeOff(bucket, row.user?.timeOff)
        return (
          <td key={bucket.key} className="px-1 py-2 align-top">
            <TimeOffBand bucket={bucket} timeOff={row.user?.timeOff} />
            {cell ? (
              <CapacityCell
                cell={cell}
                isTimeOff={off}
                onClick={() => onCellClick(row.userId, bucket.key)}
                onDropTask={
                  onDropTaskOnCell
                    ? (taskId) => onDropTaskOnCell(row.userId, bucket.key, taskId)
                    : undefined
                }
              />
            ) : null}
          </td>
        )
      })}
    </tr>
  )
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

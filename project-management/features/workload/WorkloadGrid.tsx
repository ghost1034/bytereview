'use client'

/** Scrollable workload heatmap table. */
import type { TimeBucket } from '../../lib/workload/buckets'
import type { WorkloadDateRange } from '../../lib/workload/dateRanges'
import type { WorkloadPersonRow } from '../../lib/workload/matrix'
import { WorkloadRow } from './WorkloadRow'

type Props = {
  rows: WorkloadPersonRow[]
  buckets: TimeBucket[]
  range: WorkloadDateRange
  onCellClick: (userId: string, bucketKey: string) => void
  onDropTaskOnRow: (userId: string, taskId: string) => void
  onDropTaskOnCell: (userId: string, bucketKey: string, taskId: string) => void
}

/** Person rows × time bucket columns. */
export function WorkloadGrid({
  rows,
  buckets,
  range,
  onCellClick,
  onDropTaskOnRow,
  onDropTaskOnCell,
}: Props) {
  return (
    <div className="tl-card overflow-x-auto shadow-paper-sm">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <th
              className="sticky left-0 z-10 bg-[var(--bg-elevated)] px-3 py-2 font-medium"
              style={{ color: 'var(--ink-secondary)' }}
            >
              Person
            </th>
            {buckets.map((b) => (
              <th
                key={b.key}
                className="px-1 py-2 text-center text-xs font-medium"
                style={{ color: 'var(--ink-secondary)' }}
              >
                {b.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <WorkloadRow
              key={row.userId}
              row={row}
              buckets={buckets}
              onCellClick={onCellClick}
              onDropTaskOnRow={onDropTaskOnRow}
              onDropTaskOnCell={onDropTaskOnCell}
            />
          ))}
        </tbody>
      </table>
      <p
        className="border-t px-3 py-2 text-xs"
        style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}
      >
        {range.start} – {range.end} · drag tasks from a cell dialog to reassign or reschedule
      </p>
    </div>
  )
}

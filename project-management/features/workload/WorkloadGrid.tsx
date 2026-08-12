'use client'

/** Scrollable workload heatmap table. */
import type { TimeBucket } from '../../lib/workload/buckets'
import type { WorkloadDateRange } from '../../lib/workload/dateRanges'
import type { WorkloadPersonRow } from '../../lib/workload/matrix'
import { WorkloadRow } from './WorkloadRow'
import type { Project, Task, Team } from '../../types'
import type { WorkloadGroupBy } from './WorkloadToolbar'

type Props = {
  rows: WorkloadPersonRow[]
  buckets: TimeBucket[]
  range: WorkloadDateRange
  onCellClick: (userId: string, bucketKey: string) => void
  onDropTaskOnRow: (userId: string, taskId: string) => void
  onDropTaskOnCell: (userId: string, bucketKey: string, taskId: string) => void
  onPersonClick: (userId: string) => void
  groupBy: WorkloadGroupBy
  teams: Team[]
  projects: Project[]
  tasks: Task[]
}

/** Person rows × time bucket columns. */
export function WorkloadGrid({
  rows,
  buckets,
  range,
  onCellClick,
  onDropTaskOnRow,
  onDropTaskOnCell,
  onPersonClick,
  groupBy,
  teams,
  projects,
  tasks,
}: Props) {
  const groupedRows = rows.reduce<Array<{ label: string; rows: WorkloadPersonRow[] }>>((groups, row) => {
    let label = 'People'
    if (groupBy === 'team') label = teams.find((team) => team.memberIds.includes(row.userId))?.name ?? 'No team'
    if (groupBy === 'project') {
      const projectId = tasks.find((task) => task.assigneeId === row.userId)?.projectIds[0]
      label = projects.find((project) => project.id === projectId)?.name ?? 'No project'
    }
    const group = groups.find((item) => item.label === label)
    if (group) group.rows.push(row)
    else groups.push({ label, rows: [row] })
    return groups
  }, [])
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
          {groupedRows.flatMap((group) => [
            ...(groupBy !== 'person' ? [<tr key={`group-${group.label}`}><th colSpan={buckets.length + 1} className="bg-[var(--bg-muted)] px-3 py-1 text-xs font-semibold">{group.label}</th></tr>] : []),
            ...group.rows.map((row) => <WorkloadRow key={`${group.label}-${row.userId}`} row={row} buckets={buckets} onCellClick={onCellClick} onDropTaskOnRow={onDropTaskOnRow} onDropTaskOnCell={onDropTaskOnCell} onPersonClick={onPersonClick} />),
          ])}
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

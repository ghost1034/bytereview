import { formatHours } from './utilization'
import type { TimeBucket } from './buckets'
import type { WorkloadPersonRow } from './matrix'

/** Trigger a client-side CSV download of the workload table. */
export function exportWorkloadCsv(
  rows: WorkloadPersonRow[],
  buckets: TimeBucket[],
  filename = 'workload.csv'
): void {
  const header = ['Person', 'Utilization %', ...buckets.map((b) => b.label), 'Total hours']
  const lines = [header.join(',')]

  rows.forEach((row) => {
    const cells = buckets.map((b) => {
      const cell = row.cells[b.key]
      if (!cell) return '0'
      return `${formatHours(cell.effortHours)} / ${formatHours(cell.capacityHours)}`
    })
    lines.push(
      [
        csvEscape(row.label),
        String(row.utilizationPercent),
        ...cells.map(csvEscape),
        formatHours(row.weekTotalHours),
      ].join(',')
    )
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

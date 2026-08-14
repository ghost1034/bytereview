'use client'

/** Summary stat cards for workload overview. */
type Props = {
  totalAssigned: number
  overAllocated: number
  peopleCount: number
}

/** Total assigned tasks and over-allocated people counts. */
export function WorkloadSummaryStats({ totalAssigned, overAllocated, peopleCount }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Stat label="Assigned tasks" value={String(totalAssigned)} />
      <Stat
        label="Over-allocated"
        value={String(overAllocated)}
        tone={overAllocated > 0 ? 'danger' : undefined}
      />
      <Stat label="People tracked" value={String(peopleCount)} />
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'danger'
}) {
  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: tone === 'danger' ? 'hsl(var(--destructive))' : 'hsl(var(--foreground))' }}
      >
        {value}
      </p>
    </div>
  )
}

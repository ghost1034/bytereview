'use client'

/** Editorial empty state when no workload data exists. */
import { Gauge } from 'lucide-react'

/** Warm-themed encouragement to add tasks and estimates. */
export function WorkloadEmptyState() {
  return (
    <div
      className="tl-card flex flex-col items-center justify-center px-8 py-16 text-center shadow-paper-sm"
     
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: 'var(--primary-soft)' }}
      >
        <Gauge className="h-7 w-7" style={{ color: 'var(--primary)' }} />
      </div>
      <h2 className="font-serif text-xl">Balance the work across your team</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        Assign tasks with due dates and effort estimates to see who is under capacity and who needs
        relief. Add a numeric custom field named Estimate for the most accurate picture.
      </p>
    </div>
  )
}

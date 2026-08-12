'use client'

import { TasklyticServiceErrorState } from './TasklyticDataStates'

type Props = {
  detail?: string | null
  onRetry: () => void
}

/** Recoverable boundary used when the authoritative repository cannot load. */
export function TasklyticServiceUnavailable({ detail, onRetry }: Props) {
  return (
    <div className="tasklytic-root min-h-[320px] px-6 py-8">
      <TasklyticServiceErrorState onRetry={onRetry} description={detail ?? undefined} />
    </div>
  )
}

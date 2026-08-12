'use client'

type Props = {
  detail?: string | null
  onRetry: () => void
}

/** Recoverable boundary used when the authoritative repository cannot load. */
export function TasklyticServiceUnavailable({ detail, onRetry }: Props) {
  return (
    <div
      className="tasklytic-root flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center"
      role="alert"
    >
      <div className="max-w-md space-y-1">
        <h1 className="font-serif text-xl">Project management is temporarily unavailable</h1>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          We could not load the workspace service. Your saved work is unaffected; retry when the service is available.
        </p>
        {detail ? (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            {detail}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="rounded-lg px-4 py-2 text-sm font-medium text-white"
        style={{ background: 'var(--primary)' }}
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  )
}

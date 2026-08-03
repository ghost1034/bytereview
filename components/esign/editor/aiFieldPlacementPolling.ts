import type { EsignAiFieldPlacementRun } from '@/lib/api'

const ACTIVE_AI_FIELD_PLACEMENT_STATUSES = new Set<EsignAiFieldPlacementRun['status']>([
  'queued',
  'processing',
])

export const isAiFieldPlacementRunActive = (run: EsignAiFieldPlacementRun) =>
  ACTIVE_AI_FIELD_PLACEMENT_STATUSES.has(run.status)

function waitForNextPoll(signal: AbortSignal, intervalMs: number): Promise<void> {
  if (signal.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = window.setTimeout(finish, intervalMs)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export async function pollAiFieldPlacementRun({
  runId,
  signal,
  fetchRun,
  onRun,
  intervalMs = 2000,
  wait = waitForNextPoll,
}: {
  runId: string
  signal: AbortSignal
  fetchRun: (runId: string) => Promise<EsignAiFieldPlacementRun>
  onRun: (run: EsignAiFieldPlacementRun) => void
  intervalMs?: number
  wait?: (signal: AbortSignal, intervalMs: number) => Promise<void>
}): Promise<void> {
  while (!signal.aborted) {
    await wait(signal, intervalMs)
    if (signal.aborted) return

    try {
      const latest = await fetchRun(runId)
      if (signal.aborted) return
      onRun(latest)
      if (!isAiFieldPlacementRunActive(latest)) return
    } catch {
      // A transient request failure should not strand an otherwise durable run.
    }
  }
}

/** Return complete elapsed seconds between persisted timer timestamps. */
export function elapsedTimerSeconds(startedAt: string, stoppedAt = new Date().toISOString()): number {
  const start = new Date(startedAt).getTime()
  const stop = new Date(stoppedAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(stop)) return 0
  return Math.max(0, Math.floor((stop - start) / 1000))
}

// Formatting helpers shared by the Chrona dashboard pages.

/** "2.5" hours → "2h 30m"; sub-minute values → "<1m". */
export function formatHours(hours: number | null | undefined): string {
  const totalMinutes = Math.round((hours ?? 0) * 60)
  if (totalMinutes <= 0) return '0m'
  if (totalMinutes < 1) return '<1m'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Chrona epoch-seconds timestamp → local clock time, e.g. "9:41 AM". */
export function formatClockTime(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Date → local "YYYY-MM-DD" (NOT toISOString, which buckets by UTC). */
export function toDayString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Local "YYYY-MM-DD" n days before today. */
export function dayStringDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toDayString(d)
}

/** "2026-06-03" → "Jun 3" (parsed as a local date, not UTC). */
export function formatDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  if (!y || !m || !d) return dayKey
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** ISO datetime → relative label like "5m ago" / "3h ago" / "2d ago". */
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'Never'
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return 'Never'
  const deltaSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (deltaSec < 60) return 'Just now'
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)}m ago`
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)}h ago`
  return `${Math.floor(deltaSec / 86400)}d ago`
}

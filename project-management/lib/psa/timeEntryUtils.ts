import type { TimeEntry } from '../../types'

/** Hours from durationMinutes or legacy hours field. */
export function entryHours(e: TimeEntry): number {
  if (e.durationMinutes != null) return e.durationMinutes / 60
  return e.hours
}

/** Format decimal hours as h:mm. */
export function formatHoursHMM(hours: number): string {
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Parse duration text: decimal, h:mm, or "1h 15m". */
export function parseDurationInput(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const dec = parseFloat(t)
  if (!Number.isNaN(dec) && /^\d+(\.\d+)?$/.test(t)) return dec
  const hmm = t.match(/^(\d+):(\d{1,2})$/)
  if (hmm) return parseInt(hmm[1], 10) + parseInt(hmm[2], 10) / 60
  const natural = t.match(/(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?/i)
  if (natural && (natural[1] || natural[2])) {
    return (natural[1] ? parseFloat(natural[1]) : 0) + (natural[2] ? parseInt(natural[2], 10) / 60 : 0)
  }
  return null
}

/** Monday-based week start for a date. */
export function weekBounds(date: Date, weekStart: 'monday' | 'sunday' = 'monday'): { start: string; end: string } {
  const d = new Date(date)
  const day = d.getDay()
  const offset = weekStart === 'monday' ? (day === 0 ? -6 : 1 - day) : -day
  d.setDate(d.getDate() + offset)
  const start = d.toISOString().slice(0, 10)
  const endD = new Date(d)
  endD.setDate(endD.getDate() + 6)
  return { start, end: endD.toISOString().slice(0, 10) }
}

/** ISO dates Mon–Sun for a week containing `anchor`. */
export function weekDays(anchor: Date, weekStart: 'monday' | 'sunday' = 'monday'): string[] {
  const { start } = weekBounds(anchor, weekStart)
  const days: string[] = []
  const d = new Date(start)
  for (let i = 0; i < 7; i++) {
    days.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return days
}

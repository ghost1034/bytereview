import { format, formatDistanceToNow, differenceInCalendarDays } from 'date-fns'

/** Current ISO datetime. */
export function now(): string {
  return new Date().toISOString()
}

/** Format a date for display (MMM d, yyyy). */
export function formatDate(date: string | Date): string {
  return format(typeof date === 'string' ? new Date(date) : date, 'MMM d, yyyy')
}

/** Relative time label (e.g. "2 hours ago"). */
export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(typeof date === 'string' ? new Date(date) : date, { addSuffix: true })
}

/** Calendar days between two dates. */
export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(new Date(b), new Date(a))
}

/** Format a Date as YYYY-MM-DD (ISO date). */
export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** Parse YYYY-MM-DD as local midnight (avoids UTC date-only parsing shifts). */
export function parseISODateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Parse HH:mm from an ISO datetime, or empty string. */
export function timeFromISO(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return format(d, 'HH:mm')
}

/** Combine ISO date + HH:mm into ISO datetime. */
export function combineDateAndTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

/**
 * Dashboard digest scheduler — runs on boot and at next-run timestamps.
 * V1: queues PendingEmail via EmailAdapter; production swaps adapter + adds PNG snapshot.
 */
import { addDays, addMonths, nextMonday, setDate, startOfDay } from 'date-fns'
import { now } from '../time'
import { queueDashboardDigest } from './digestEmail'
import type { DashboardSchedule, ReportingDashboard } from './types'

/** Compute next run from frequency anchor. */
export function nextRunForFrequency(frequency: DashboardSchedule['frequency'], from = new Date()): string {
  const base = startOfDay(from)
  if (frequency === 'daily') return addDays(base, 1).toISOString()
  if (frequency === 'weekly_mon') return nextMonday(base).toISOString()
  const nextMonth = addMonths(base, 1)
  return setDate(nextMonth, 1).toISOString()
}

/** Process due dashboard schedules once. */
export async function runDueDashboardDigests(
  dashboards: ReportingDashboard[],
  updateDashboard: (id: string, patch: Partial<ReportingDashboard>) => Promise<void>
): Promise<void> {
  const ts = Date.now()
  for (const dashboard of dashboards) {
    const schedule = dashboard.schedule
    if (!schedule?.recipients.length || !schedule.nextRunAt) continue
    if (new Date(schedule.nextRunAt).getTime() > ts) continue
    await queueDashboardDigest(dashboard, schedule.recipients)
    const nextRunAt = nextRunForFrequency(schedule.frequency)
    await updateDashboard(dashboard.id, { schedule: { ...schedule, nextRunAt }, updatedAt: now() })
  }
}

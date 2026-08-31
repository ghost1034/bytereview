import type { JobScheduleOut, SourceOut, SourceSchedulesOut } from './types';

type ScheduledSource = Pick<SourceOut, 'adapter' | 'enabled'>;

export function scheduleForSource(source: ScheduledSource, schedules?: SourceSchedulesOut): JobScheduleOut | undefined {
  return schedules?.jobs.find((job) => job.adapters.includes(source.adapter));
}

export function sourceScheduleLabel(source: ScheduledSource, schedules?: SourceSchedulesOut): string {
  if (!source.enabled) return 'Disabled';
  if (!schedules) return 'Schedule unavailable';
  if (schedules.mode === 'manual') return 'Manual only';
  return scheduleForSource(source, schedules)?.label ?? 'Not scheduled';
}

export function nextCrawlBatch(schedules?: SourceSchedulesOut): string | null {
  if (schedules?.mode !== 'cloud_run') return null;
  const nextRuns = schedules.jobs
    .filter((job) => job.adapters.length > 0 && job.next_run_at)
    .map((job) => job.next_run_at!);
  return nextRuns.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
}

/** Explicit UTC formatting: a browser's local timezone must not change a UTC label. */
export function formatScheduleTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

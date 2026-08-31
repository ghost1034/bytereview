import { describe, expect, it } from 'vitest';
import { formatScheduleTime, nextCrawlBatch, sourceScheduleLabel } from './schedules';
import type { SourceSchedulesOut } from './types';

const schedules: SourceSchedulesOut = {
  mode: 'cloud_run',
  jobs: [
    { job: 'dispatch', adapters: [], schedule_cron: '* * * * *', timezone: 'UTC', label: 'Every minute', next_run_at: '2026-08-31T12:01:00Z' },
    { job: 'crawl', adapters: ['rss', 'html', 'json', 'fixture'], schedule_cron: '0 0 * * *', timezone: 'UTC', label: 'Daily at 00:00 UTC', next_run_at: '2026-09-01T00:00:00Z' },
    { job: 'crawl-news', adapters: ['news'], schedule_cron: '10 0 * * *', timezone: 'UTC', label: 'Daily at 00:10 UTC', next_run_at: '2026-09-01T00:10:00Z' },
  ],
};

describe('effective batch schedules', () => {
  it('uses the API batch instead of stale source cron metadata or last-run time', () => {
    const source = { adapter: 'news', enabled: true, schedule_cron: '0 */6 * * *', last_run_at: '2026-08-31T11:00:00Z' };
    expect(sourceScheduleLabel(source, schedules)).toBe('Daily at 00:10 UTC');
    expect(sourceScheduleLabel({ ...source, enabled: false }, schedules)).toBe('Disabled');
  });

  it('finds the earliest crawl batch without including minute-by-minute notifications', () => {
    expect(nextCrawlBatch(schedules)).toBe('2026-09-01T00:00:00Z');
    const refreshed: SourceSchedulesOut = {
      ...schedules,
      jobs: schedules.jobs.map((job) => job.job === 'crawl' ? { ...job, next_run_at: '2026-09-02T00:00:00Z' } : job),
    };
    expect(nextCrawlBatch(refreshed)).toBe('2026-09-01T00:10:00Z');
  });

  it('does not invent schedules for local environments, missing data, or unsupported adapters', () => {
    const source = { adapter: 'rss', enabled: true };
    const local: SourceSchedulesOut = { ...schedules, mode: 'manual' };
    expect(sourceScheduleLabel(source, local)).toBe('Manual only');
    expect(nextCrawlBatch(local)).toBeNull();
    expect(sourceScheduleLabel(source)).toBe('Schedule unavailable');
    expect(nextCrawlBatch()).toBeNull();
    expect(sourceScheduleLabel({ adapter: 'unknown', enabled: true }, schedules)).toBe('Not scheduled');
  });

  it('formats the actual UTC instant even when supplied with a local offset', () => {
    expect(formatScheduleTime('2026-08-31T17:10:00-07:00')).toBe('2026-09-01 00:10 UTC');
    expect(formatScheduleTime(null)).toBe('—');
    expect(formatScheduleTime('invalid')).toBe('—');
  });
});

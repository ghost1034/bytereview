'use client'

/** Boot-time dashboard digest scheduler hook. */
import { useEffect } from 'react'
import { runDueDashboardDigests } from '../../lib/reporting/scheduler'
import type { ReportingDashboard } from '../../lib/reporting/types'
import { useDashboardsStore } from '../../stores/entities'
import { usesTasklyticBackend } from '../../lib/forms/publicFormApi'

/** Run due digests on mount and every 30 minutes. */
export function useReportingScheduler(workspaceId: string | null): void {
  const dashboards = useDashboardsStore((s) => s.list())
  const update = useDashboardsStore((s) => s.update)

  useEffect(() => {
    if (!workspaceId || usesTasklyticBackend()) return
    const run = () => {
      const rows = dashboards.filter((d) => d.workspaceId === workspaceId) as ReportingDashboard[]
      void runDueDashboardDigests(rows, (id, patch) => update(id, patch))
    }
    run()
    const timer = window.setInterval(run, 30 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [workspaceId, dashboards, update])
}

'use client'

/** Project-scoped dashboard entry point backed by the shared reporting builder. */
import { useMemo, useState } from 'react'
import { BarChart3, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildEmptyDashboard } from '../../lib/reporting/dashboardActions'
import type { ReportingDashboard } from '../../lib/reporting/types'
import { useAuthStore } from '../../stores/auth'
import { useDashboardsStore } from '../../stores/entities'
import { DashboardPage } from '../reporting/DashboardPage'
import type { Project } from '../../types'

type Props = { project: Project; basePath: string }

export function ProjectDashboardTab({ project, basePath }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const dashboards = useDashboardsStore((s) => s.list()) as ReportingDashboard[]
  const add = useDashboardsStore((s) => s.add)
  const projectDashboards = useMemo(
    () => dashboards.filter((dashboard) => dashboard.projectId === project.id),
    [dashboards, project.id]
  )
  const [selectedId, setSelectedId] = useState<string | null>(projectDashboards[0]?.id ?? null)
  const selected = projectDashboards.find((dashboard) => dashboard.id === selectedId) ?? projectDashboards[0]
  const workspaceBase = `/dashboard/project-management/w/${project.workspaceId}`

  const createDashboard = async () => {
    if (!currentUserId) return
    const dashboard: ReportingDashboard = {
      ...buildEmptyDashboard(project.workspaceId, currentUserId, `${project.name} dashboard`),
      projectId: project.id,
    }
    await add(dashboard)
    setSelectedId(dashboard.id)
  }

  if (selected) {
    return (
      <div className="space-y-3">
        {projectDashboards.length > 1 ? (
          <div className="flex flex-wrap gap-2" aria-label="Project dashboards">
            {projectDashboards.map((dashboard) => (
              <Button
                key={dashboard.id}
                size="sm"
                variant={dashboard.id === selected.id ? 'secondary' : 'outline'}
                onClick={() => setSelectedId(dashboard.id)}
              >
                {dashboard.name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => void createDashboard()}>
              <Plus className="mr-1 h-4 w-4" /> New dashboard
            </Button>
          </div>
        ) : null}
        <DashboardPage
          workspaceId={project.workspaceId}
          dashboardId={selected.id}
          basePath={workspaceBase}
          returnHref={`${basePath}?view=dashboard`}
          breadcrumbLabel={project.name}
          fixedProjectId={project.id}
        />
      </div>
    )
  }

  return (
    <div className="tl-card flex flex-col items-center gap-3 p-10 text-center shadow-sm">
      <BarChart3 className="h-9 w-9" style={{ color: 'hsl(var(--foreground-subtle))' }} />
      <div>
        <p className="font-sans text-lg">Build a project dashboard</p>
        <p className="mt-1 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          Charts created here stay attached to {project.name}.
        </p>
      </div>
      <Button className="tl-btn-primary border-0" onClick={() => void createDashboard()}>
        <Plus className="mr-1 h-4 w-4" /> Create dashboard
      </Button>
    </div>
  )
}

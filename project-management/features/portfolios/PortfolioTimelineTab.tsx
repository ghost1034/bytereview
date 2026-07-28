'use client'

/** PortfolioTimelineTab — portfolio-wide timeline using TimelineRenderer per project. */
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { EnrichedPortfolio } from '../../lib/portfolios/types'
import { useAuthStore } from '../../stores/auth'
import { useProjectsStore, useSectionsStore, useTagsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import { buildProjectTaskHref } from '../tasks/useTaskDetailUrl'
import { useTimelineState } from '../views/timeline/useTimelineState'
import { TimelineRenderer } from '../views/timeline/TimelineRenderer'

type Props = {
  portfolio: EnrichedPortfolio
  workspaceId: string
}

function ProjectTimelineBlock({
  projectId,
  workspaceId,
  color,
}: {
  projectId: string
  workspaceId: string
  color: string
}) {
  const router = useRouter()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const project = useProjectsStore((s) => s.getById(projectId))
  const sections = useSectionsStore((s) =>
    s.list().filter((sec) => sec.projectId === projectId).sort((a, b) => a.order - b.order)
  )
  const tasks = useTasksStore((s) => s.list().filter((t) => t.projectIds.includes(projectId) && !t.parentId))
  const users = useUsersStore((s) => s.list())
  const tags = useTagsStore((s) => s.list())
  const ui = useTimelineState(projectId)
  const basePath = `/dashboard/project-management/w/${workspaceId}/projects/${projectId}`

  if (!project) return null

  return (
    <div className="border-t pt-3" style={{ borderColor: 'var(--border-subtle)' }}>
      <TimelineRenderer
        project={project}
        tasks={tasks}
        sections={sections}
        users={users}
        tags={tags.filter((t) => t.workspaceId === project.workspaceId)}
        zoom={ui.zoom}
        panX={ui.panX}
        setPanX={ui.setPanX}
        onZoomIn={ui.zoomIn}
        onZoomOut={ui.zoomOut}
        colorBy="section"
        rowsBy="section"
        autoShift={ui.autoShift}
        highlightCriticalPath={ui.highlightCriticalPath}
        showBaseline={ui.showBaseline}
        baseline={ui.baseline}
        railWidth={ui.railWidth}
        railCollapsed={ui.railCollapsed}
        collapsedSections={new Set(ui.collapsedSectionIds)}
        onToggleSection={ui.toggleSection}
        actorId={currentUserId}
        onOpenTask={(id) => router.push(buildProjectTaskHref(basePath, id, new URLSearchParams(), 'timeline'))}
      />
      <style>{`[data-chart] .tl-timeline-bar { --bar-accent: ${color}; }`}</style>
    </div>
  )
}

export function PortfolioTimelineTab({ portfolio, workspaceId }: Props) {
  const projects = useProjectsStore((s) => s.list())
  const linked = useMemo(
    () => portfolio.projectIds.map((id) => projects.find((p) => p.id === id)).filter(Boolean),
    [portfolio.projectIds, projects]
  )
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!linked.length) {
    return (
      <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
        Add projects to see a portfolio-wide timeline.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {linked.map((p) => {
        if (!p) return null
        const isCollapsed = collapsed.has(p.id)
        return (
          <section key={p.id} className="tl-card overflow-hidden shadow-paper-sm">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
              style={{ background: `${p.color === 'primary' ? 'var(--primary-soft)' : 'var(--bg-muted)'}` }}
              onClick={() => toggle(p.id)}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span>{p.iconEmoji ?? '📁'}</span>
              <span className="font-medium">{p.name}</span>
            </button>
            {!isCollapsed && (
              <div className="p-2">
                <ProjectTimelineBlock projectId={p.id} workspaceId={workspaceId} color={p.color} />
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

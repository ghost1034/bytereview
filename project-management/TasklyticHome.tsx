'use client'

/** TasklyticHome — workspace home with project cards and welcome. */
import { useMemo, useState } from 'react'
import { Plus, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePageMeta } from './hooks/usePageMeta'
import { useWorkspaceContext } from './hooks/useWorkspaceContext'
import { toggleStarProject } from './lib/projectActions'
import { useAuthStore } from './stores/auth'
import { useProjectsStore, useUsersStore } from './stores/entities'
import { CreateProjectDialog } from './features/projects/CreateProjectDialog'
import { ProjectCard } from './features/projects/ProjectCard'
import { MyTasksSummary } from './features/my-tasks/MyTasksSummary'
import { HomeGoalsOverview } from './features/ui/HomeGoalsOverview'
import { HomeOnboardingChecklist } from './features/ui/HomeOnboardingChecklist'
import { TasklyticEmptyState } from './features/ui/TasklyticEmptyState'
import { QuickAddTaskDialog } from './features/tasks/QuickAddTaskDialog'
import { InvitePeopleDialog } from './features/shell/InvitePeopleDialog'
import type { Project } from './types'

export function TasklyticHome() {
  const { workspaceId, workspace, booting } = useWorkspaceContext()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const user = useUsersStore((s) => (currentUserId ? s.getById(currentUserId) : undefined))
  const projects = useProjectsStore((s) =>
    s.list().filter((p) => p.workspaceId === workspaceId && !p.archived)
  )
  const starredIds = user?.starredProjectIds ?? []
  const starredProjects = useMemo(
    () => projects.filter((p) => starredIds.includes(p.id)),
    [projects, starredIds]
  )
  const otherProjects = useMemo(
    () => projects.filter((p) => !starredIds.includes(p.id)),
    [projects, starredIds]
  )
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  usePageMeta({
    breadcrumbs: workspace
      ? [{ label: 'Tasklytic', href: '#' }, { label: workspace.name }]
      : [],
  })

  if (booting) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          Loading your workspace…
        </p>
      </div>
    )
  }

  if (!workspaceId) {
    return (
      <TasklyticEmptyState
        headline="Welcome to Tasklytic"
        subhead="Pick a workspace to begin organizing projects, tasks, and goals."
      />
    )
  }

  const renderProjectCard = (project: Project) => (
    <ProjectCard
      key={project.id}
      project={project}
      href={`/dashboard/project-management/w/${workspaceId}/projects/${project.id}`}
      starred={starredIds.includes(project.id)}
      currentUserId={currentUserId ?? undefined}
      onToggleStar={
        currentUserId
          ? () => void toggleStarProject(project.id, currentUserId, starredIds)
          : undefined
      }
    />
  )

  return (
    <div className="space-y-6" data-tour-page="home">
      <div className="bg-surface-muted rounded-2xl p-6 shadow-sm">
        <h1 className="font-sans text-3xl">Good day{user ? `, ${user.name.split(' ')[0]}` : ''}</h1>
        <p className="mt-2 max-w-prose text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
          {workspace?.name ?? 'Your workspace'} — projects, tasks, and goals in one calm place.
        </p>
        <Button className=" mt-4 border-0" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New project
        </Button>
      </div>

      <HomeOnboardingChecklist
        workspaceId={workspaceId}
        onCreateProject={() => setCreateOpen(true)}
        onQuickAdd={() => setQuickAddOpen(true)}
        onInvite={() => setInviteOpen(true)}
      />

      <MyTasksSummary workspaceId={workspaceId} />

      {starredProjects.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-sans text-lg">
            <Star className="h-4 w-4" fill="hsl(var(--warning))" stroke="hsl(var(--warning))" />
            Starred
          </h2>
          <div className="flex flex-wrap gap-4">
            {starredProjects.map(renderProjectCard)}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 font-sans text-lg">Your projects</h2>
        {otherProjects.length ? (
          <div className="flex flex-wrap gap-4">
            {otherProjects.map(renderProjectCard)}
          </div>
        ) : starredProjects.length ? (
          <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
            All projects are starred. Unstar a project to move it here.
          </p>
        ) : (
          <TasklyticEmptyState
            headline="Your canvas is blank"
            subhead="Every great workflow starts with a single project. Name it, invite your team, and add the first task."
            ctaLabel="Create your first project"
            onCta={() => setCreateOpen(true)}
            learnMoreHref="/docs/tasklytic/projects-and-tasks"
          />
        )}
      </section>

      <HomeGoalsOverview workspaceId={workspaceId} />

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} workspaceId={workspaceId} />
      <QuickAddTaskDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} workspaceId={workspaceId} />
      <InvitePeopleDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}

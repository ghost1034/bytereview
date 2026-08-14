'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useProjectsStore, useTasksStore, useUsersStore } from '../../stores/entities'
import { userWeeklyCapacity } from '../../lib/workload'

export function PeoplePage({ userId }: { userId: string }) {
  const { workspaceId, workspace } = useWorkspaceContext()
  const user = useUsersStore((state) => state.getById(userId))
  const tasks = useTasksStore((state) => state.list())
  const projects = useProjectsStore((state) => state.list())
  const basePath = `/dashboard/project-management/w/${workspaceId}`
  const assigned = useMemo(
    () => tasks.filter((task) => task.workspaceId === workspaceId && task.assigneeId === userId && !task.completed),
    [tasks, userId, workspaceId]
  )
  const activeProjects = useMemo(
    () => projects.filter((project) => project.workspaceId === workspaceId && !project.archived && project.memberIds.includes(userId)),
    [projects, userId, workspaceId]
  )
  usePageMeta({
    breadcrumbs: workspaceId
      ? [{ label: 'Tasklytic', href: `${basePath}/home` }, { label: 'People', href: `${basePath}/search` }, { label: user?.name ?? 'Profile' }]
      : [],
  })

  if (!user || !workspace?.memberIds.includes(userId)) {
    return <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Person not found in this workspace.</p>
  }

  return <div className="space-y-5" data-people-drilldown>
    <header className="tl-card flex flex-wrap items-center gap-4 p-5 shadow-sm">
      <div className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: user.avatarColor }}>{user.name.slice(0, 2).toUpperCase()}</div>
      <div><h1 className="font-sans text-2xl">{user.name}</h1><p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{user.jobTitle ?? user.email}</p></div>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="Open work" value={assigned.length} />
      <Metric label="Active projects" value={activeProjects.length} />
      <Metric label="Weekly capacity" value={`${userWeeklyCapacity(user)}h`} />
    </div>
    <section className="tl-card p-5 shadow-sm"><h2 className="font-semibold">Current work</h2>
      {assigned.length ? <ul className="mt-3 divide-y" style={{ borderColor: 'hsl(var(--border))' }}>{assigned.map((task) => <li key={task.id} className="py-2 text-sm"><Link className="hover:underline" href={`${basePath}/tasks/${task.id}`}>{task.name}</Link></li>)}</ul> : <p className="mt-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No open assigned work.</p>}
    </section>
  </div>
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="tl-card p-4 shadow-sm"><p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>
}

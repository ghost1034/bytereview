'use client'

import type { Project, Task } from '../../types'

export function SearchResultsChart({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const values = projects.map((project) => ({ name: project.name, count: tasks.filter((task) => task.projectIds.includes(project.id)).length })).filter((item) => item.count)
  const max = Math.max(1, ...values.map((item) => item.count))
  return <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)' }} data-search-view="chart">
    <h2 className="mb-4 font-medium">Tasks by project</h2>
    <div className="space-y-3">{values.map((item) => <div key={item.name} className="grid grid-cols-[140px_1fr_40px] items-center gap-2 text-sm"><span className="truncate">{item.name}</span><span className="h-5 rounded" style={{ width: `${(item.count / max) * 100}%`, background: 'var(--primary-soft)' }} /><span>{item.count}</span></div>)}</div>
  </div>
}

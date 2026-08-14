'use client'

import type { Project, Task } from '../../types'

export function SearchResultsBoard({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const columns = projects
    .map((project) => ({ project, tasks: tasks.filter((task) => task.projectIds.includes(project.id)) }))
    .filter((column) => column.tasks.length)
  return <div className="flex gap-3 overflow-x-auto" data-search-view="board">
    {columns.map(({ project, tasks: rows }) => <section key={project.id} className="min-w-64 rounded-xl border p-3" style={{ borderColor: 'hsl(var(--border))' }}>
      <h2 className="text-sm font-semibold">{project.name} <span className="font-normal">({rows.length})</span></h2>
      <div className="mt-2 space-y-2">{rows.map((task) => <div key={task.id} className="rounded-lg border p-2 text-sm" style={{ borderColor: 'hsl(var(--border))' }}>{task.name}</div>)}</div>
    </section>)}
  </div>
}

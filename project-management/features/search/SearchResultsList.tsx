'use client'

/**
 * Search results table for tasks and projects with highlighting.
 */
import { useRouter } from 'next/navigation'
import type { Project, Tag, Task, User } from '../../types'
import { formatDate } from '../../lib/time'
import { HighlightText } from './HighlightText'

type TaskRow = {
  task: Task
  snippet?: string
}

type Props = {
  tab: 'all' | 'tasks' | 'projects'
  query: string
  basePath: string
  taskRows: TaskRow[]
  projectRows: Project[]
  users: User[]
  projects: Project[]
  tags: Tag[]
}

export function SearchResultsList({
  tab,
  query,
  basePath,
  taskRows,
  projectRows,
  users,
  projects,
  tags,
}: Props) {
  const router = useRouter()
  const showTasks = tab === 'all' || tab === 'tasks'
  const showProjects = tab === 'all' || tab === 'projects'

  return (
    <div className="space-y-4">
      {showTasks ? (
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
          {tab === 'all' ? (
            <p className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--bg-muted)', color: 'var(--ink-muted)' }}>
              Tasks
            </p>
          ) : null}
          <div
            className="grid grid-cols-[minmax(200px,1fr)_140px_120px_100px_120px_100px] gap-2 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: 'var(--bg-muted)', color: 'var(--ink-muted)' }}
          >
            <span>Task</span>
            <span>Project(s)</span>
            <span>Assignee</span>
            <span>Due date</span>
            <span>Tag(s)</span>
            <span>Modified</span>
          </div>
          {taskRows.length ? (
            taskRows.map(({ task, snippet }) => {
              const assignee = users.find((u) => u.id === task.assigneeId)
              const taskProjects = task.projectIds
                .map((id) => projects.find((p) => p.id === id)?.name)
                .filter(Boolean)
                .join(', ')
              const taskTags = task.tagIds
                .map((id) => tags.find((t) => t.id === id)?.name)
                .filter(Boolean)
                .join(', ')
              const projectId = task.projectIds[0]
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      projectId
                        ? `${basePath}/projects/${projectId}?task=${task.id}`
                        : `${basePath}/projects?task=${task.id}`
                    )
                  }
                  className="grid w-full grid-cols-[minmax(200px,1fr)_140px_120px_100px_120px_100px] gap-2 border-b px-3 py-2 text-left text-sm hover:opacity-95"
                  style={{ borderColor: 'var(--border-subtle)', minHeight: 40, background: 'var(--bg-elevated)' }}
                >
                  <span className="min-w-0">
                    <span className="block truncate">
                      <HighlightText text={task.name} query={query} />
                    </span>
                    {snippet ? (
                      <span className="block truncate text-xs" style={{ color: 'var(--ink-muted)' }}>
                        <HighlightText text={snippet} query={query} />
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate" style={{ color: 'var(--ink-secondary)' }}>
                    {taskProjects || '—'}
                  </span>
                  <span className="truncate" style={{ color: 'var(--ink-secondary)' }}>
                    {assignee?.name ?? '—'}
                  </span>
                  <span style={{ color: 'var(--ink-muted)' }}>{task.dueOn ? formatDate(task.dueOn) : '—'}</span>
                  <span className="truncate" style={{ color: 'var(--ink-secondary)' }}>
                    {taskTags || '—'}
                  </span>
                  <span style={{ color: 'var(--ink-muted)' }}>{formatDate(task.modifiedAt)}</span>
                </button>
              )
            })
          ) : (
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
              No tasks match your search.
            </p>
          )}
        </div>
      ) : null}

      {showProjects ? (
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
          {tab === 'all' ? (
            <p className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--bg-muted)', color: 'var(--ink-muted)' }}>
              Projects
            </p>
          ) : null}
          <div
            className="grid grid-cols-[minmax(200px,1fr)_120px_100px_120px_100px] gap-2 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: 'var(--bg-muted)', color: 'var(--ink-muted)' }}
          >
            <span>Name</span>
            <span>Status</span>
            <span>Owner</span>
            <span>Due</span>
            <span>Members</span>
          </div>
          {projectRows.length ? (
            projectRows.map((project) => {
              const owner = users.find((u) => u.id === project.ownerId)
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => router.push(`${basePath}/projects/${project.id}`)}
                  className="grid w-full grid-cols-[minmax(200px,1fr)_120px_100px_120px_100px] gap-2 border-b px-3 py-2 text-left text-sm hover:opacity-95"
                  style={{ borderColor: 'var(--border-subtle)', minHeight: 40, background: 'var(--bg-elevated)' }}
                >
                  <span className="truncate">
                    {query ? <HighlightText text={project.name} query={query} /> : project.name}
                  </span>
                  <span className="capitalize" style={{ color: 'var(--ink-secondary)' }}>
                    {project.status?.replace(/_/g, ' ') ?? '—'}
                  </span>
                  <span className="truncate" style={{ color: 'var(--ink-secondary)' }}>
                    {owner?.name ?? '—'}
                  </span>
                  <span style={{ color: 'var(--ink-muted)' }}>
                    {project.dueOn ? formatDate(project.dueOn) : '—'}
                  </span>
                  <span style={{ color: 'var(--ink-muted)' }}>{project.memberIds.length}</span>
                </button>
              )
            })
          ) : (
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
              No projects match your search.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

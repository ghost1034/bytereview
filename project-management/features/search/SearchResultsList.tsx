'use client'

/**
 * Search results table for tasks and projects with highlighting.
 */
import { useRouter } from 'next/navigation'
import type { Goal, Project, Tag, Task, User } from '../../types'
import { computeGoalProgress } from '../../lib/goals/goalProgress'
import { formatDate } from '../../lib/time'
import { HighlightText } from './HighlightText'
import { VirtualizedItems } from '../ui/VirtualizedItems'

type TaskRow = {
  task: Task
  snippet?: string
}

type Props = {
  tab: 'tasks' | 'projects' | 'goals' | 'people'
  query: string
  basePath: string
  taskRows: TaskRow[]
  projectRows: Project[]
  goalRows: Goal[]
  peopleRows: User[]
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
  goalRows,
  peopleRows,
}: Props) {
  const router = useRouter()
  const showTasks = tab === 'tasks'
  const showProjects = tab === 'projects'

  return (
    <div className="space-y-4">
      {showTasks ? (
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
          <div
            className="grid grid-cols-[minmax(200px,1fr)_140px_120px_100px_120px_100px] gap-2 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}
          >
            <span>Task</span>
            <span>Project(s)</span>
            <span>Assignee</span>
            <span>Due date</span>
            <span>Tag(s)</span>
            <span>Modified</span>
          </div>
          {taskRows.length ? (
            <VirtualizedItems items={taskRows} rowHeight={56} renderItem={({ task, snippet }) => {
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
                  style={{ borderColor: 'hsl(var(--border))', minHeight: 40, background: 'hsl(var(--card))' }}
                >
                  <span className="min-w-0">
                    <span className="block truncate">
                      <HighlightText text={task.name} query={query} />
                    </span>
                    {snippet ? (
                      <span className="block truncate text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
                        <HighlightText text={snippet} query={query} />
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate" style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {taskProjects || '—'}
                  </span>
                  <span className="truncate" style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {assignee?.name ?? '—'}
                  </span>
                  <span style={{ color: 'hsl(var(--foreground-muted))' }}>{task.dueOn ? formatDate(task.dueOn) : '—'}</span>
                  <span className="truncate" style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {taskTags || '—'}
                  </span>
                  <span style={{ color: 'hsl(var(--foreground-muted))' }}>{formatDate(task.modifiedAt)}</span>
                </button>
              )
            }} />
          ) : (
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              No tasks match your search.
            </p>
          )}
        </div>
      ) : null}

      {showProjects ? (
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
          <div
            className="grid grid-cols-[minmax(200px,1fr)_120px_100px_120px_100px] gap-2 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}
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
                  style={{ borderColor: 'hsl(var(--border))', minHeight: 40, background: 'hsl(var(--card))' }}
                >
                  <span className="truncate">
                    {query ? <HighlightText text={project.name} query={query} /> : project.name}
                  </span>
                  <span className="capitalize" style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {project.status?.replace(/_/g, ' ') ?? '—'}
                  </span>
                  <span className="truncate" style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {owner?.name ?? '—'}
                  </span>
                  <span style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {project.dueOn ? formatDate(project.dueOn) : '—'}
                  </span>
                  <span style={{ color: 'hsl(var(--foreground-muted))' }}>{project.memberIds.length}</span>
                </button>
              )
            })
          ) : (
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              No projects match your search.
            </p>
          )}
        </div>
      ) : null}

      {tab === 'goals' ? (
        <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="grid grid-cols-[minmax(220px,1fr)_140px_120px_120px] gap-2 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'hsl(var(--surface-muted))', color: 'hsl(var(--foreground-muted))' }}>
            <span>Goal</span><span>Owner</span><span>Progress</span><span>Status</span>
          </div>
          {goalRows.map((goal) => {
            const progress = computeGoalProgress(goal.id, goalRows, [])
            return <button key={goal.id} type="button" onClick={() => router.push(`${basePath}/goals/${goal.id}`)} className="grid w-full grid-cols-[minmax(220px,1fr)_140px_120px_120px] gap-2 border-b px-3 py-2 text-left text-sm" style={{ borderColor: 'hsl(var(--border))' }}>
              <span><HighlightText text={goal.name} query={query} /></span>
              <span>{users.find((user) => user.id === goal.ownerId)?.name ?? '—'}</span>
              <span>{progress.percent}%</span>
              <span className="capitalize">{progress.statusInferred.replace(/_/g, ' ')}</span>
            </button>
          })}
          {!goalRows.length ? <p className="px-4 py-8 text-center text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No goals match your search.</p> : null}
        </div>
      ) : null}

      {tab === 'people' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {peopleRows.map((person) => <div key={person.id} className="rounded-xl border p-4" style={{ borderColor: 'hsl(var(--border))' }}>
            <p className="font-medium"><HighlightText text={person.name} query={query} /></p>
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>{person.email}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="text-xs underline" onClick={() => router.push(`${basePath}/people/${person.id}`)}>Open profile</button>
              <button type="button" className="text-xs underline" onClick={() => router.push(`${basePath}/my-tasks?assignee=${person.id}`)}>View work</button>
            </div>
          </div>)}
          {!peopleRows.length ? <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>No people match your search.</p> : null}
        </div>
      ) : null}
    </div>
  )
}

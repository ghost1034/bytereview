/**
 * Public search API — thin wrappers over the in-memory index.
 */
import type { Comment, Project, Task } from '../../types'
import { getSearchIndex, type SearchHit } from './workspaceIndex'

export type { SearchHit } from './workspaceIndex'

export function searchWorkspaceTasks(
  query: string,
  workspaceId: string,
  tasks: Task[],
  projects: Project[],
  basePath: string,
  limit = 50,
  comments: Comment[] = []
): SearchHit[] {
  const index = getSearchIndex(tasks, projects, comments)
  return index.searchTasks(query, workspaceId, basePath, limit).map((h) => {
    if (h.type !== 'task') return h
    const task = tasks.find((t) => t.id === h.id)
    return { ...h, label: task?.name ?? h.label }
  })
}

export function searchWorkspaceProjects(
  query: string,
  workspaceId: string,
  projects: Project[],
  basePath: string,
  limit = 50,
  includeArchived = false,
  tasks: Task[] = [],
  comments: Comment[] = []
): SearchHit[] {
  const index = getSearchIndex(tasks, projects, comments)
  return index.searchProjects(query, workspaceId, basePath, limit, includeArchived).map((h) => {
    if (h.type !== 'project') return h
    const project = projects.find((p) => p.id === h.id)
    return { ...h, label: project?.name ?? h.label }
  })
}

export function searchWorkspace(
  query: string,
  workspaceId: string,
  projects: Project[],
  tasks: Task[],
  basePath: string,
  comments: Comment[] = []
): SearchHit[] {
  const index = getSearchIndex(tasks, projects, comments)
  const taskHits = index.searchTasks(query, workspaceId, basePath, 20).map((h) => {
    if (h.type !== 'task') return h
    return { ...h, label: tasks.find((t) => t.id === h.id)?.name ?? h.label }
  })
  const projectHits = index.searchProjects(query, workspaceId, basePath, 20).map((h) => {
    if (h.type !== 'project') return h
    return { ...h, label: projects.find((p) => p.id === h.id)?.name ?? h.label }
  })
  return [...projectHits.slice(0, 8), ...taskHits.slice(0, 8)]
}

export { getSearchIndex, WorkspaceSearchIndex } from './workspaceIndex'
export { highlightMatch } from './highlight'

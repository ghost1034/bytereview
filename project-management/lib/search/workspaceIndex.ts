/**
 * In-memory inverted index core for workspace search.
 * SearchAdapter seam — production swap-out: Elasticsearch / Typesense / Meilisearch.
 */
import type { Comment, Project, Task } from '../../types'
import { snippetAroundMatch } from './highlight'

export type SearchHit =
  | { type: 'project'; id: string; label: string; href: string; snippet?: string; score: number }
  | { type: 'task'; id: string; label: string; href: string; snippet?: string; projectIds?: string[]; score: number }
  | { type: 'comment'; id: string; label: string; href: string; snippet?: string; taskId: string; score: number }

type TaskIndexEntry = {
  id: string
  workspaceId: string
  nameLower: string
  tokens: string[]
  notesLower: string
  projectIds: string[]
}

type ProjectIndexEntry = {
  id: string
  workspaceId: string
  nameLower: string
  tokens: string[]
  descLower: string
  archived: boolean
}

type CommentIndexEntry = {
  id: string
  taskId: string
  workspaceId: string
  bodyLower: string
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').replace(/<[^>]+>/g, '').toLowerCase()
}

function tokenize(text: string): string[] {
  return text.split(/[\s,.;:!?()[\]{}"']+/).filter((t) => t.length > 1)
}

/** In-memory inverted index for workspace search. */
export class WorkspaceSearchIndex {
  private tasks = new Map<string, TaskIndexEntry>()
  private projects = new Map<string, ProjectIndexEntry>()
  private comments = new Map<string, CommentIndexEntry>()
  private taskTokenIndex = new Map<string, Set<string>>()
  private projectTokenIndex = new Map<string, Set<string>>()

  rebuild(tasks: Task[], projects: Project[], comments: Comment[], taskWorkspaceLookup: Map<string, string>) {
    this.tasks.clear()
    this.projects.clear()
    this.comments.clear()
    this.taskTokenIndex.clear()
    this.projectTokenIndex.clear()

    projects.forEach((p) => {
      const nameLower = p.name.toLowerCase()
      const descLower = normalizeText(p.description)
      const tokens = [...new Set([...tokenize(nameLower), ...tokenize(descLower)])]
      this.projects.set(p.id, { id: p.id, workspaceId: p.workspaceId, nameLower, tokens, descLower, archived: p.archived })
      tokens.forEach((t) => this.indexToken(this.projectTokenIndex, t, p.id))
    })

    tasks.forEach((t) => {
      const nameLower = t.name.toLowerCase()
      const notesLower = normalizeText(t.notes)
      const tokens = [...new Set([...tokenize(nameLower), ...tokenize(notesLower)])]
      this.tasks.set(t.id, { id: t.id, workspaceId: t.workspaceId, nameLower, tokens, notesLower, projectIds: t.projectIds })
      tokens.forEach((tok) => this.indexToken(this.taskTokenIndex, tok, t.id))
    })

    comments.forEach((c) => {
      const workspaceId = taskWorkspaceLookup.get(c.taskId)
      if (!workspaceId) return
      this.comments.set(c.id, { id: c.id, taskId: c.taskId, workspaceId, bodyLower: normalizeText(c.bodyHtml) })
    })
  }

  private indexToken(index: Map<string, Set<string>>, token: string, id: string) {
    const set = index.get(token) ?? new Set<string>()
    set.add(id)
    index.set(token, set)
  }

  private scoreText(text: string, q: string): number {
    if (!text.includes(q)) return 0
    if (text === q) return 100
    if (text.startsWith(q)) return 80
    return 50
  }

  private collectCandidates(index: Map<string, Set<string>>, q: string): Set<string> {
    const ids = new Set<string>()
    index.forEach((set, token) => {
      if (token.includes(q) || q.includes(token)) set.forEach((id) => ids.add(id))
    })
    index.get(q)?.forEach((id) => ids.add(id))
    return ids
  }

  searchTasks(query: string, workspaceId: string, basePath: string, limit = 50): SearchHit[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hits: SearchHit[] = []
    for (const id of this.collectCandidates(this.taskTokenIndex, q)) {
      const entry = this.tasks.get(id)
      if (!entry || entry.workspaceId !== workspaceId) continue
      const score = Math.max(this.scoreText(entry.nameLower, q), this.scoreText(entry.notesLower, q) * 0.6)
      if (!score) continue
      const projectId = entry.projectIds[0]
      hits.push({
        type: 'task',
        id: entry.id,
        label: entry.nameLower,
        href: projectId ? `${basePath}/projects/${projectId}?task=${entry.id}` : `${basePath}/projects?task=${entry.id}`,
        snippet: snippetAroundMatch(entry.notesLower, q),
        projectIds: entry.projectIds,
        score,
      })
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  searchProjects(query: string, workspaceId: string, basePath: string, limit = 50, includeArchived = false): SearchHit[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hits: SearchHit[] = []
    for (const id of this.collectCandidates(this.projectTokenIndex, q)) {
      const entry = this.projects.get(id)
      if (!entry || entry.workspaceId !== workspaceId) continue
      if (!includeArchived && entry.archived) continue
      const score = Math.max(this.scoreText(entry.nameLower, q), this.scoreText(entry.descLower, q) * 0.5)
      if (!score) continue
      hits.push({
        type: 'project',
        id: entry.id,
        label: entry.nameLower,
        href: `${basePath}/projects/${entry.id}`,
        snippet: entry.descLower ? entry.descLower.slice(0, 120) : undefined,
        score,
      })
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  searchComments(query: string, workspaceId: string, basePath: string, tasks: Task[], limit = 20): SearchHit[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hits: SearchHit[] = []
    this.comments.forEach((entry) => {
      if (entry.workspaceId !== workspaceId) return
      const score = this.scoreText(entry.bodyLower, q)
      if (!score) return
      const task = tasks.find((t) => t.id === entry.taskId)
      const projectId = task?.projectIds[0]
      hits.push({
        type: 'comment',
        id: entry.id,
        label: task?.name ?? 'Comment',
        href: projectId ? `${basePath}/projects/${projectId}?task=${entry.taskId}` : `${basePath}/projects?task=${entry.taskId}`,
        snippet: snippetAroundMatch(entry.bodyLower, q),
        taskId: entry.taskId,
        score,
      })
    })
    return hits.sort((a, b) => b.score - a.score).slice(0, limit)
  }
}

    const sharedIndex = new WorkspaceSearchIndex()

export function getSearchIndex(tasks: Task[], projects: Project[], comments: Comment[] = []): WorkspaceSearchIndex {
  const lookup = new Map(tasks.map((t) => [t.id, t.workspaceId]))
  sharedIndex.rebuild(tasks, projects, comments, lookup)
  return sharedIndex
}

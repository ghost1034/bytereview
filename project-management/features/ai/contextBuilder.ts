/**
 * Builds structured JSON context for AI prompts from store data.
 */
import { summarizeProjectActivity } from '../status/summaries'
import {
  useActivityStore,
  useCommentsStore,
  useCustomFieldsStore,
  useGoalsStore,
  usePortfoliosStore,
  useProjectsStore,
  useStatusUpdatesStore,
  useTasksStore,
  useUsersStore,
} from '../../stores/entities'
import type { AiContextBundle, AiContextScope } from '../../lib/ai/types'

function recentTasks(projectId: string, limit = 50) {
  return useTasksStore
    .getState()
    .list()
    .filter((t) => t.projectIds.includes(projectId))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      name: t.name,
      completed: t.completed,
      assigneeId: t.assigneeId,
      dueOn: t.dueOn,
      modifiedAt: t.modifiedAt,
    }))
}

function recentComments(taskIds: string[], limit = 20) {
  const set = new Set(taskIds)
  return useCommentsStore
    .getState()
    .list()
    .filter((c) => set.has(c.taskId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((c) => ({ id: c.id, taskId: c.taskId, body: c.bodyHtml.replace(/<[^>]+>/g, '').slice(0, 280) }))
}

function statusUpdates(scope: AiContextScope, limit = 5) {
  if (scope.type !== 'project' && scope.type !== 'portfolio' && scope.type !== 'goal') return []
  const id = scope.type === 'project' ? scope.projectId : scope.type === 'goal' ? scope.goalId : scope.portfolioId
  const type = scope.type
  return useStatusUpdatesStore
    .getState()
    .list()
    .filter((u) => u.scope.type === type && u.scope.id === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((u) => ({ title: u.title, status: u.status, createdAt: u.createdAt }))
}

/** Produce a structured context bundle for the given scope. */
export function buildAiContext(scope: AiContextScope): AiContextBundle {
  if (scope.type === 'workspace') {
    const tasks = useTasksStore.getState().list().filter((t) => t.workspaceId === scope.workspaceId)
    const overdue = tasks.filter((t) => !t.completed && t.dueOn).length
    return {
      scope,
      label: 'Workspace',
      json: {
        workspaceId: scope.workspaceId,
        taskCount: tasks.length,
        openTasks: tasks.filter((t) => !t.completed).length,
        overdueWithDue: overdue,
        projects: useProjectsStore.getState().list().filter((p) => p.workspaceId === scope.workspaceId).slice(0, 20).map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
        })),
      },
    }
  }

  if (scope.type === 'project') {
    const project = useProjectsStore.getState().getById(scope.projectId)
    const tasks = recentTasks(scope.projectId)
    const digest = summarizeProjectActivity(scope.projectId)
    const taskIds = tasks.map((t) => t.id)
    const total = useTasksStore.getState().list().filter((t) => t.projectIds.includes(scope.projectId))
    const done = total.filter((t) => t.completed).length
    return {
      scope,
      label: project?.name ?? 'Project',
      json: {
        workspaceId: project?.workspaceId,
        project: project
          ? { id: project.id, name: project.name, status: project.status, description: project.description, memberIds: project.memberIds }
          : null,
        metrics: {
          totalTasks: total.length,
          percentComplete: total.length ? Math.round((done / total.length) * 100) : 0,
          overdue: digest.tasksOverdue.length,
          completedRecently: digest.tasksCompleted.length,
        },
        recentTasks: tasks,
        recentComments: recentComments(taskIds),
        statusUpdates: statusUpdates(scope),
        customFields: (project?.customFieldIds ?? []).map((id) => {
          const f = useCustomFieldsStore.getState().getById(id)
          return f ? { id: f.id, name: f.name, type: f.type } : null
        }).filter(Boolean),
        activity: useActivityStore
          .getState()
          .list()
          .filter((a) => a.projectId === scope.projectId)
          .slice(-10)
          .map((a) => ({ type: a.type, createdAt: a.createdAt })),
      },
    }
  }

  if (scope.type === 'task') {
    const task = useTasksStore.getState().getById(scope.taskId)
    const subtasks = useTasksStore.getState().list().filter((t) => t.parentId === scope.taskId)
    const comments = useCommentsStore.getState().list().filter((c) => c.taskId === scope.taskId)
    return {
      scope,
      label: task?.name ?? 'Task',
      json: {
        workspaceId: task?.workspaceId,
        task: task
          ? {
              id: task.id,
              name: task.name,
              notes: task.notes?.replace(/<[^>]+>/g, '').slice(0, 500),
              completed: task.completed,
              assigneeId: task.assigneeId,
              dueOn: task.dueOn,
              projectIds: task.projectIds,
              customFieldValues: task.customFieldValues,
            }
          : null,
        subtasks: subtasks.map((s) => ({ id: s.id, name: s.name, completed: s.completed })),
        comments: comments.slice(-20).map((c) => ({
          authorId: c.authorId,
          body: c.bodyHtml.replace(/<[^>]+>/g, '').slice(0, 200),
        })),
        assignee: task?.assigneeId ? useUsersStore.getState().getById(task.assigneeId)?.name : null,
      },
    }
  }

  if (scope.type === 'goal') {
    const goal = useGoalsStore.getState().getById(scope.goalId)
    return {
      scope,
      label: goal?.name ?? 'Goal',
      json: {
        workspaceId: goal?.workspaceId,
        goal,
        statusUpdates: statusUpdates(scope),
        supportingProjects: (goal?.supportingProjectIds ?? []).map((id: string) => useProjectsStore.getState().getById(id)?.name).filter(Boolean),
      },
    }
  }

  const portfolio = usePortfoliosStore.getState().getById(scope.portfolioId)
  return {
    scope,
    label: portfolio?.name ?? 'Portfolio',
    json: {
      workspaceId: portfolio?.workspaceId,
      portfolio,
      statusUpdates: statusUpdates(scope),
      projects: (portfolio?.projectIds ?? []).map((id) => {
        const p = useProjectsStore.getState().getById(id)
        return p ? { id: p.id, name: p.name, status: p.status } : null
      }).filter(Boolean),
    },
  }
}

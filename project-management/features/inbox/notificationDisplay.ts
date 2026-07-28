import {
  AtSign,
  Bell,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  MessageSquare,
  Sparkles,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import type { Notification } from '../../types'
import {
  useFormsStore,
  useGoalsStore,
  usePortfoliosStore,
  useProjectsStore,
  useTasksStore,
  useTeamsStore,
  useUsersStore,
} from '../../stores/entities'

const TYPE_ICONS: Record<Notification['type'], LucideIcon> = {
  mention: AtSign,
  assigned: CheckSquare,
  due_soon: CalendarClock,
  comment_on_task: MessageSquare,
  status_update: TrendingUp,
  project_message: MessageSquare,
  rule_action: Sparkles,
  form_submission: ClipboardList,
  approval_request: CheckSquare,
  team_join_request: UserPlus,
}

/** Icon for a notification type. */
export function notificationTypeIcon(type: Notification['type']): LucideIcon {
  return TYPE_ICONS[type] ?? Bell
}

/** Resolve human-readable resource name and breadcrumb for a notification scope. */
export function notificationScopeMeta(notification: Notification): {
  resourceName: string
  breadcrumb: string
} {
  const { scope } = notification
  const tasks = useTasksStore.getState()
  const projects = useProjectsStore.getState()
  const portfolios = usePortfoliosStore.getState()
  const goals = useGoalsStore.getState()
  const forms = useFormsStore.getState()
  const teams = useTeamsStore.getState()

  if (scope.type === 'task') {
    const task = tasks.getById(scope.id)
    const project = task?.projectIds[0] ? projects.getById(task.projectIds[0]) : undefined
    return {
      resourceName: task?.name ?? (notification.metadata?.taskName as string) ?? 'Task',
      breadcrumb: project ? `Project · ${project.name}` : 'Task',
    }
  }
  if (scope.type === 'project') {
    const project = projects.getById(scope.id)
    return { resourceName: project?.name ?? 'Project', breadcrumb: 'Project' }
  }
  if (scope.type === 'portfolio') {
    const p = portfolios.getById(scope.id)
    return { resourceName: p?.name ?? 'Portfolio', breadcrumb: 'Portfolio' }
  }
  if (scope.type === 'goal') {
    const g = goals.getById(scope.id)
    return { resourceName: g?.name ?? 'Goal', breadcrumb: 'Goal' }
  }
  if (scope.type === 'form') {
    const f = forms.getById(scope.id)
    return { resourceName: f?.name ?? 'Form', breadcrumb: 'Form' }
  }
  if (scope.type === 'team') {
    const t = teams.getById(scope.id)
    return { resourceName: t?.name ?? 'Team', breadcrumb: 'Team' }
  }
  return { resourceName: 'Notification', breadcrumb: '' }
}

/** Display title — prefer stored message; enrich assigned/mention with actor name. */
export function notificationTitle(notification: Notification): string {
  if (notification.message) return notification.message
  const actor = notification.actorId
    ? useUsersStore.getState().getById(notification.actorId)
    : undefined
  const name = actor?.name ?? 'Someone'
  switch (notification.type) {
    case 'assigned':
      return `${name} assigned you a task`
    case 'mention':
      return `${name} mentioned you`
    default:
      return 'New notification'
  }
}

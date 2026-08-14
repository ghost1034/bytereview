'use client'

/** InboxPreviewPane — contextual preview of the selected notification resource. */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDate, formatRelative } from '../../lib/time'
import type { Notification } from '../../types'
import {
  useProjectsStore,
  useStatusUpdatesStore,
  useTasksStore,
  useUsersStore,
} from '../../stores/entities'
import { UserAvatar } from '../profile/UserAvatar'
import { notificationScopeMeta, notificationTitle } from './notificationDisplay'
import { notificationOpenHref } from './inboxNavigation'

type Props = {
  workspaceId: string
  notification: Notification | null
}

/** Right-pane preview for the selected inbox notification. */
export function InboxPreviewPane({ workspaceId, notification }: Props) {
  const router = useRouter()
  const task = useTasksStore((s) =>
    notification?.scope.type === 'task' ? s.getById(notification.scope.id) : undefined
  )
  const projectFromScope = useProjectsStore((s) =>
    notification?.scope.type === 'project' ? s.getById(notification.scope.id) : undefined
  )
  const projectFromTask = useProjectsStore((s) =>
    task?.projectIds[0] ? s.getById(task.projectIds[0]) : undefined
  )
  const project = projectFromScope ?? projectFromTask
  const actor = useUsersStore((s) =>
    notification?.actorId ? s.getById(notification.actorId) : undefined
  )
  const statusUpdate = useStatusUpdatesStore((s) =>
    notification?.type === 'status_update' && notification.metadata?.updateId
      ? s.getById(String(notification.metadata.updateId))
      : undefined
  )

  if (!notification) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center px-8 text-center"
        style={{ color: 'hsl(var(--foreground-muted))' }}
      >
        <p className="text-sm">Select a notification to preview its details.</p>
      </div>
    )
  }

  const { resourceName, breadcrumb } = notificationScopeMeta(notification)
  const title = notificationTitle(notification)
  const href = notificationOpenHref(workspaceId, notification)

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-6">
        <div className="flex items-start gap-3">
          {notification.actorId ? (
            <UserAvatar userId={notification.actorId} size="md" showPresence={false} />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-medium" style={{ color: 'hsl(var(--foreground))' }}>
              {title}
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--foreground-muted))' }}>
              {formatRelative(notification.createdAt)}
              {actor ? ` · ${actor.name}` : ''}
            </p>
          </div>
        </div>

        <div className="tl-card space-y-2 p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {breadcrumb}
          </p>
          <h2 className="font-sans text-xl" style={{ color: 'hsl(var(--foreground))' }}>
            {resourceName}
          </h2>
          {task?.notes ? (
            <p className="line-clamp-4 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              {task.notes.replace(/<[^>]+>/g, '').slice(0, 280)}
            </p>
          ) : null}
          {project && notification.scope.type !== 'project' ? (
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              Project: {project.name}
            </p>
          ) : null}
          {task?.dueOn ? (
            <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              Due {formatDate(task.dueOn)}
            </p>
          ) : null}
          {statusUpdate ? (
            <div className="space-y-2 text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
              <p className="font-medium">{statusUpdate.title}</p>
              <p className="line-clamp-6">{statusUpdate.summaryHtml.replace(/<[^>]+>/g, '')}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            className="tl-btn-primary"
            onClick={() => {
              if (notification.scope.type === 'task') {
                router.push(`${href.split('/tasks/')[0]}/inbox?task=${notification.scope.id}`)
                return
              }
              router.push(href)
            }}
          >
            Open {notification.scope.type}
          </Button>
          <Button variant="outline" asChild>
            <Link href={href}>
              <ExternalLink className="mr-1 h-4 w-4" /> Go to resource
            </Link>
          </Button>
        </div>
      </div>
    </ScrollArea>
  )
}

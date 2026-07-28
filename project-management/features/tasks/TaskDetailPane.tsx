'use client'

/**
 * TaskDetailPane — 640px right slide-in (or full-screen) task editor driven by ?task=.
 */
import { useEffect, useRef } from 'react'
import { useAuthStore } from '../../stores/auth'
import { useTasksStore } from '../../stores/entities'
import { AttachmentsZone } from '../attachments/AttachmentsZone'
import { MobileTaskDetailBar } from '../ui/MobileTaskDetailBar'
import { TaskDetailSkeleton } from '../ui/TasklyticSkeletons'
import { DependenciesSection } from './DependenciesSection'
import { SubtaskList, SubtaskBreadcrumbs } from './SubtaskList'
import { SubtaskAiSuggest } from './SubtaskAiSuggest'
import { TaskAssigneeField } from './TaskAssigneeField'
import { TaskCustomFieldsSection } from '../custom-fields/TaskCustomFieldsSection'
import { TaskDescriptionEditor } from './TaskDescriptionEditor'
import { TaskDescriptionAiMagic } from './TaskDescriptionAiMagic'
import { TaskDetailFooter } from './TaskDetailFooter'
import { TaskDetailTabs } from './TaskDetailTabs'
import { TaskDueDateField } from './TaskDueDateField'
import { TaskFollowersField } from './TaskFollowersField'
import { TaskHeaderRow } from './TaskHeaderRow'
import { TaskProjectsField } from './TaskProjectsField'
import { TaskTagsField } from './TaskTagsField'
import { TaskTitleField } from './TaskTitleField'
import { useTaskDetailUrl } from './useTaskDetailUrl'

type Props = {
  workspaceId: string
  /** When set (full-screen route), ignores ?task= param. */
  taskId?: string | null
  mode?: 'overlay' | 'fullscreen'
}

export function TaskDetailPane({ workspaceId, taskId: explicitTaskId, mode = 'overlay' }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const commentsRef = useRef<HTMLDivElement>(null)
  const { taskId: urlTaskId, closeTask, copyTaskLink, fullScreenHref, openTask } = useTaskDetailUrl(
    mode === 'fullscreen' ? explicitTaskId : undefined
  )
  const taskId = mode === 'fullscreen' ? explicitTaskId : urlTaskId ?? explicitTaskId
  const task = useTasksStore((s) => (taskId ? s.getById(taskId) : undefined))
  const hydrated = useTasksStore((s) => s.hydrated)

  useEffect(() => {
    if (mode !== 'overlay' || !taskId) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mode, taskId])

  useEffect(() => {
    if (mode !== 'overlay' || !taskId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTask()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeTask, mode, taskId])

  if (!taskId) return null

  if (!hydrated || !task) {
    return mode === 'overlay' ? (
      <>
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" aria-hidden="true" />
        <aside
          className="fixed inset-0 z-50 flex flex-col lg:inset-y-0 lg:left-auto lg:w-full lg:max-w-[640px] lg:border-l tl-task-detail-pane tl-dialog-surface tasklytic-root"
          style={{ borderColor: 'var(--border-subtle)' }}
          role="dialog"
          aria-label="Loading task"
          aria-busy="true"
        >
          <TaskDetailSkeleton />
        </aside>
      </>
    ) : (
      <div className="tasklytic-root min-h-screen">
        <TaskDetailSkeleton />
      </div>
    )
  }

  const close = () => {
    if (mode === 'fullscreen' && typeof window !== 'undefined') {
      window.history.back()
      return
    }
    closeTask()
  }

  const focusComments = () => {
    commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const tab = commentsRef.current?.closest('[data-state]')
    tab?.querySelector<HTMLButtonElement>('[value="comments"]')?.click()
  }

  const pane = (
    <aside
      className={
        mode === 'fullscreen'
          ? 'flex h-full min-h-screen w-full flex-col tl-task-detail-pane tl-dialog-surface tasklytic-root'
          : 'fixed inset-0 z-50 flex h-full w-full flex-col border-l shadow-paper-lg lg:inset-y-0 lg:left-auto lg:max-w-[640px] tl-task-detail-pane tl-dialog-surface tasklytic-root'
      }
      style={{ borderColor: 'var(--border-subtle)' }}
      role="dialog"
      aria-modal={mode === 'overlay'}
      aria-label={`Task: ${task.name}`}
    >
      <div className="sticky top-0 z-10 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
        <TaskHeaderRow
          task={task}
          onClose={close}
          onCopyLink={() => copyTaskLink(task.id, workspaceId)}
          fullScreenHref={mode === 'overlay' ? fullScreenHref(task.id, workspaceId) : undefined}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <SubtaskBreadcrumbs task={task} projectId={task.projectIds[0]} />
        <TaskTitleField task={task} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <div className="space-y-4 border-b pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4" style={{ borderColor: 'var(--border-subtle)' }}>
            <TaskAssigneeField task={task} />
            <TaskDueDateField task={task} />
            <TaskProjectsField task={task} />
            <DependenciesSection task={task} />
            <TaskCustomFieldsSection task={task} />
            <div className="hidden lg:block">
              <TaskTagsField task={task} />
            </div>
            <TaskFollowersField task={task} />
          </div>
          <div>
            <div className="mb-2 flex justify-end">
              <TaskDescriptionAiMagic task={task} />
            </div>
            <TaskDescriptionEditor task={task} />
            <div className="mb-2 flex justify-end">
              <SubtaskAiSuggest taskId={task.id} />
            </div>
            <SubtaskList task={task} />
            <AttachmentsZone task={task} />
            <TaskDetailTabs task={task} commentsRef={commentsRef} />
          </div>
        </div>
      </div>
      <MobileTaskDetailBar
        task={task}
        currentUserId={currentUserId}
        onClose={close}
        onFocusComments={focusComments}
      />
      <div className="hidden lg:block">
        <TaskDetailFooter task={task} onClose={close} onOpenTask={openTask} />
      </div>
    </aside>
  )

  if (mode === 'fullscreen') {
    return <div className="tasklytic-root min-h-screen">{pane}</div>
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:block"
        aria-label="Close task"
        onClick={close}
      />
      {pane}
    </>
  )
}

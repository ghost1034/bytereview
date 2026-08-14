'use client'

/** TaskCard — Kanban card with cover strip, metadata, and drag handle. */
import { useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import Image from 'next/image'
import { CSS } from '@dnd-kit/utilities'
import { CheckSquare, GitBranch, MessageSquare, Paperclip, ThumbsUp } from 'lucide-react'
import type { CustomField, Tag, Task, User } from '../../../types'
import { useAttachmentsStore, useCommentsStore } from '../../../stores/entities'
import { formatDate } from '../../../lib/time'
import { getFileStorageAdapter } from '../../../lib/fileStorage'
import { FieldValueCell } from '../../custom-fields/FieldValueCell'
import { getSubtaskProgress } from '../../tasks'
import { UserAvatar } from '../../profile/UserAvatar'
import { coverColorFromTags, dueChipStyle } from './boardUtils'

type Props = {
  task: Task
  cardFields: CustomField[]
  allFields: CustomField[]
  tags: Tag[]
  users: User[]
  allTasks: Task[]
  density: 'compact' | 'comfortable'
  onOpen: () => void
}

export function TaskCard({
  task,
  cardFields,
  allFields,
  tags,
  users,
  allTasks,
  density,
  onOpen,
}: Props) {
  const commentCount = useCommentsStore(
    (s) => s.list().filter((c) => c.taskId === task.id).length
  )
  const coverAttachment = useAttachmentsStore((s) =>
    task.coverAttachmentId ? s.getById(task.coverAttachmentId) : undefined
  )
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!coverAttachment || !coverAttachment.mime.startsWith('image/')) {
      setCoverUrl(null)
      return
    }
    if (coverAttachment.dataUrl) {
      setCoverUrl(coverAttachment.dataUrl)
      return
    }
    void getFileStorageAdapter().getUrl(coverAttachment).then((url) => {
      if (!cancelled) setCoverUrl(url)
    }).catch(() => {
      if (!cancelled) setCoverUrl(null)
    })
    return () => { cancelled = true }
  }, [coverAttachment])
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  const compact = density === 'compact'
  const cover = coverColorFromTags(task, tags)
  const taskTags = task.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => Boolean(t))
  const progress = getSubtaskProgress(task.id, allTasks)
  const dueStyle = dueChipStyle(task.dueOn)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }}
      className={`tl-card mb-2 cursor-grab shadow-sm active:cursor-grabbing ${compact ? 'p-2' : 'p-3'}`}
      {...attributes}
      {...listeners}
    >
      {coverUrl ? (
        <Image
          unoptimized
          src={coverUrl}
          alt=""
          width={288}
          height={96}
          className="-mx-3 -mt-3 mb-2 h-24 w-[calc(100%+1.5rem)] rounded-t-xl object-cover"
        />
      ) : cover ? (
        <div className="-mx-3 -mt-3 mb-2 h-1 rounded-t-xl" style={{ background: cover }} />
      ) : null}
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <p className={`font-medium line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}>{task.name}</p>
        <div className={`flex items-center justify-between gap-2 ${compact ? 'mt-1' : 'mt-2'}`}>
          {task.assigneeId ? (
            <UserAvatar userId={task.assigneeId} size="sm" showPresence={false} />
          ) : (
            <span className="text-[10px]" style={{ color: 'hsl(var(--foreground-subtle))' }}>
              +
            </span>
          )}
          {task.dueOn ? (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={dueStyle}
            >
              {formatDate(task.dueOn)}
            </span>
          ) : null}
        </div>
        {!compact && taskTags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {taskTags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: `${tag.color}22`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {taskTags.length > 3 ? (
              <span className="text-[10px]" style={{ color: 'hsl(var(--foreground-muted))' }}>
                +{taskTags.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}
        {!compact && progress.total > 0 ? (
          <p className="mt-1.5 text-[10px]" style={{ color: 'hsl(var(--foreground-muted))' }}>
            {progress.done}/{progress.total} subtasks
          </p>
        ) : null}
        {!compact && cardFields.length > 0 ? (
          <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: 'hsl(var(--border))' }}>
            {cardFields.map((field) => (
              <div key={field.id} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 truncate" style={{ color: 'hsl(var(--foreground-muted))' }}>
                  {field.name}
                </span>
                <FieldValueCell
                  field={field}
                  task={task}
                  allFields={allFields}
                  users={users}
                  className="flex-1 truncate"
                />
              </div>
            ))}
          </div>
        ) : null}
        {!compact ? (
          <div className="mt-2 flex items-center gap-2 text-[10px]" style={{ color: 'hsl(var(--foreground-subtle))' }}>
            {progress.total > 0 ? <GitBranch className="h-3 w-3" aria-hidden /> : null}
            {commentCount > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" /> {commentCount}
              </span>
            ) : null}
            {task.attachmentIds.length > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="h-3 w-3" /> {task.attachmentIds.length}
              </span>
            ) : null}
            {task.dependencyIds.length > 0 ? <CheckSquare className="h-3 w-3" aria-hidden /> : null}
            {task.likedByIds.length > 0 ? (
              <span className="inline-flex items-center gap-0.5">
                <ThumbsUp className="h-3 w-3" /> {task.likedByIds.length}
              </span>
            ) : null}
          </div>
        ) : null}
      </button>
    </div>
  )
}

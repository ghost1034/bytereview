'use client'

/**
 * TaskHeaderRow — complete toggle, subtype, header tags, like, copy link, fullscreen, close.
 */
import { useState } from 'react'
import Link from 'next/link'
import {
  Check,
  Copy,
  Diamond,
  Heart,
  Maximize2,
  Share2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  setApprovalStatus,
  setSubtype,
  toggleComplete,
  toggleLike,
} from '../../lib/taskActions'
import { useAuthStore } from '../../stores/auth'
import { useTagsStore } from '../../stores/entities'
import type { ApprovalStatus, Task, TaskSubtype } from '../../types'
import { TagPicker } from './TagPicker'
import { addTagToTask, removeTagFromTask } from '../../lib/taskActions'

type Props = {
  task: Task
  onClose: () => void
  onCopyLink: () => void
  fullScreenHref?: string
}

const SUBTYPES: { value: TaskSubtype; label: string }[] = [
  { value: 'default_task', label: 'Task' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'approval', label: 'Approval' },
]

const APPROVAL_ACTIONS: { status: ApprovalStatus; label: string }[] = [
  { status: 'approved', label: 'Approve' },
  { status: 'rejected', label: 'Reject' },
  { status: 'changes_requested', label: 'Request changes' },
]

export function TaskHeaderRow({ task, onClose, onCopyLink, fullScreenHref }: Props) {
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const tags = useTagsStore((s) => s.list())
  const [copied, setCopied] = useState(false)
  const liked = currentUserId ? task.likedByIds.includes(currentUserId) : false
  const isApproval = task.resourceSubtype === 'approval'

  const onCompleteClick = async () => {
    if (!currentUserId) return
    if (!isApproval) await toggleComplete(task.id, currentUserId)
  }

  const onApproval = async (status: ApprovalStatus) => {
    if (!currentUserId) return
    await setApprovalStatus(task.id, status, currentUserId)
  }

  const onSubtype = async (subtype: TaskSubtype) => {
    if (!currentUserId) return
    await setSubtype(task.id, subtype, currentUserId)
  }

  const onLike = async () => {
    if (!currentUserId) return
    await toggleLike(task.id, currentUserId)
  }

  const handleCopy = () => {
    onCopyLink()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const headerTags = task.tagIds.slice(0, 3).map((id) => tags.find((t) => t.id === id)).filter(Boolean)

  const completeButton = (
    <button
      type="button"
      onClick={() => void onCompleteClick()}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-transform hover:scale-105"
      style={{
        borderColor: task.completed ? 'hsl(var(--success))' : 'hsl(var(--border))',
        background: task.completed ? 'hsl(var(--success-soft))' : 'transparent',
      }}
      aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
    >
      {task.resourceSubtype === 'milestone' ? (
        <Diamond className="h-4 w-4" style={{ color: task.completed ? 'hsl(var(--success))' : 'hsl(var(--foreground-muted))' }} />
      ) : (
        <Check className="h-4 w-4" style={{ color: task.completed ? 'hsl(var(--success))' : 'hsl(var(--foreground-muted))' }} />
      )}
    </button>
  )

  return (
    <header className="border-b px-4 py-3" style={{ borderColor: 'hsl(var(--border))' }}>
      <div className="flex items-start gap-2">
        {isApproval ? (
          <Popover>
            <PopoverTrigger asChild>{completeButton}</PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              {APPROVAL_ACTIONS.map((a) => (
                <button
                  key={a.status}
                  type="button"
                  className="flex w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[hsl(var(--surface-muted))]"
                  onClick={() => void onApproval(a.status)}
                >
                  {a.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : (
          completeButton
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: 'hsl(var(--surface-muted))' }}>
                  {SUBTYPES.find((s) => s.value === task.resourceSubtype)?.label ?? 'Task'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {SUBTYPES.map((s) => (
                  <DropdownMenuItem key={s.value} onClick={() => void onSubtype(s.value)}>
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {isApproval ? (
              <Badge variant="outline" className="text-xs capitalize">
                {task.approvalStatus?.replace(/_/g, ' ') ?? 'pending'}
              </Badge>
            ) : null}
            {headerTags.map((t) =>
              t ? (
                <Badge key={t.id} variant="secondary" className="text-xs" style={{ background: `${t.color}22`, color: t.color }}>
                  {t.name}
                </Badge>
              ) : null
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" aria-label="Like" onClick={() => void onLike()}>
            <Heart className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} style={{ color: liked ? 'hsl(var(--destructive))' : undefined }} />
            {task.likedByIds.length ? (
              <span className="ml-0.5 text-xs">{task.likedByIds.length}</span>
            ) : null}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Copy link" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
          </Button>
          {copied ? (
            <span className="text-xs" style={{ color: 'hsl(var(--success))' }}>
              Copied
            </span>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Share" onClick={handleCopy}>
            <Share2 className="h-4 w-4" />
          </Button>
          {fullScreenHref ? (
            <Button variant="ghost" size="icon" aria-label="Open full screen" asChild>
              <Link href={fullScreenHref}>
                <Maximize2 className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-2 lg:hidden">
        <TagPicker
          workspaceId={task.workspaceId}
          selectedIds={task.tagIds}
          onAdd={(id) => currentUserId && void addTagToTask(task.id, id, currentUserId)}
          onRemove={(id) => currentUserId && void removeTagFromTask(task.id, id, currentUserId)}
        />
      </div>
    </header>
  )
}

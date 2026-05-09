'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { JobStatusBadge, type JobStatus } from '@/components/ui/job-status-badge'
import { apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { getJobNavigationPath } from '@/lib/utils/jobNavigation'

interface JobCardProps {
  job: {
    id: string
    name?: string
    config_step?: string
    status: string
    progress_percentage?: number
    tasks_completed?: number
    tasks_total?: number
    tasks_failed?: number
    created_at: string
    latest_run_created_at?: string
    latest_run_completed_at?: string | null
    has_configured_fields?: boolean | null
  }
  onDelete?: (jobId: string) => void
}

const STEP_LABELS: Record<string, string> = {
  upload: 'Upload files',
  fields: 'Configure fields',
  review: 'Review & submit',
  submitted: 'Submitted',
}

function stepLabel(step: string | undefined) {
  if (!step) return 'Setup'
  return STEP_LABELS[step] ?? step
}

function statusIconFor(status: string, configStep: string | undefined) {
  if (configStep && configStep !== 'submitted') {
    return Clock
  }
  switch (status) {
    case 'completed':
      return CheckCircle
    case 'failed':
      return AlertCircle
    default:
      return Clock
  }
}

function relativeTime(value: string) {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export default function JobCard({ job, onDelete }: JobCardProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const StatusIcon = statusIconFor(job.status, job.config_step)
  const startedAt = job.latest_run_created_at || job.created_at
  const completedAt = job.latest_run_completed_at || undefined

  const handleNavigate = () => {
    router.push(getJobNavigationPath(job))
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    try {
      await apiClient.deleteJob(job.id)
      toast({
        title: 'Job deleted',
        description: 'The job has been successfully deleted.',
      })
      onDelete?.(job.id)
      setShowDeleteDialog(false)
    } catch (error) {
      console.error('Error deleting job:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete the job. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const status = (job.status as JobStatus) ?? 'pending'

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open job ${job.name || 'Untitled job'}`}
        onClick={handleNavigate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleNavigate()
          }
        }}
        className={cn(
          'group rounded-lg border border-border bg-surface-raised p-4 shadow-xs transition-all',
          'hover:border-border-strong hover:shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground"
              aria-hidden
            >
              <FileText className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {job.name || 'Untitled job'}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
                <span className="inline-flex items-center gap-1">
                  <StatusIcon className="size-3.5" aria-hidden />
                  {stepLabel(job.config_step)}
                </span>
                <span aria-hidden className="text-foreground-subtle">·</span>
                <span>Created {relativeTime(startedAt)}</span>
                {completedAt && (
                  <>
                    <span aria-hidden className="text-foreground-subtle">·</span>
                    <span>Completed {relativeTime(completedAt)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="flex flex-col items-end gap-1.5">
              <JobStatusBadge status={status} />
              {job.has_configured_fields !== undefined && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-xs',
                    job.has_configured_fields
                      ? 'text-success'
                      : 'text-destructive',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block size-1.5 rounded-full',
                      job.has_configured_fields
                        ? 'bg-success'
                        : 'bg-destructive',
                    )}
                    aria-hidden
                  />
                  {job.has_configured_fields ? 'Configured' : 'Not configured'}
                </span>
              )}
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Job actions"
                  className="size-8 text-foreground-muted hover:text-foreground"
                  onClick={(event) => event.stopPropagation()}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <MoreHorizontal className="size-4" aria-hidden />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowDeleteDialog(true)
                  }}
                  disabled={isDeleting}
                >
                  <Trash2 className="mr-2 size-4" aria-hidden />
                  Delete job
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;
              {job.name || 'Untitled job'}&rdquo;? This action cannot be undone
              and will permanently delete all associated files and results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Deleting…
                </>
              ) : (
                'Delete job'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

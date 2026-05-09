/**
 * Review and Start Step for Job Workflow
 * Final review before starting the extraction job
 */
'use client'

import {
  ArrowLeft,
  Clock,
  FileText,
  Loader2,
  Play,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Section } from '@/components/ui/section'
import { Separator } from '@/components/ui/separator'
import { StatCard } from '@/components/ui/stat-card'
import { useToast } from '@/hooks/use-toast'
import { JobWorkflowState } from '@/lib/api'
import { pluralize } from '@/lib/utils'

const ESTIMATED_MINUTES_PER_FILE = 0.5

interface ReviewAndStartStepProps {
  workflowState: JobWorkflowState
  onJobStarted: (jobName?: string, templateId?: string) => void
  onBack: () => void
  isLoading?: boolean
  readOnly?: boolean
  isLatestSelected?: boolean
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function ReviewAndStartStep({
  workflowState,
  onJobStarted,
  onBack,
  isLoading,
  readOnly = false,
  isLatestSelected = true,
}: ReviewAndStartStepProps) {
  const { toast } = useToast()

  const handleStartJob = async () => {
    if (!workflowState.jobId) {
      toast({
        title: 'Error',
        description: 'No job ID found. Please go back and upload files again.',
        variant: 'destructive',
      })
      return
    }
    onJobStarted(undefined, workflowState.templateId)
  }

  const totalFileSize = workflowState.files.reduce(
    (sum, file) => sum + (file.size_bytes || 0),
    0,
  )
  const estimatedTime = Math.max(
    1,
    Math.ceil(workflowState.files.length * ESTIMATED_MINUTES_PER_FILE),
  )

  return (
    <div className="space-y-6">
      {/* File summary */}
      <Section
        variant="card"
        title={
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4 text-foreground-muted" aria-hidden />
            Files to process
          </span>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Files" value={workflowState.files.length} />
            <StatCard label="Total size" value={formatFileSize(totalFileSize)} />
            <StatCard label="Fields" value={workflowState.fields.length} />
            <StatCard
              label="Time est."
              value={`~${estimatedTime}`}
              hint="minutes"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">File list</h4>
            <div className="grid max-h-32 grid-cols-1 gap-1.5 overflow-y-auto md:grid-cols-2">
              {workflowState.files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 text-sm"
                >
                  <FileText
                    className="size-4 text-foreground-subtle"
                    aria-hidden
                  />
                  <span className="truncate text-foreground">
                    {file.original_filename}
                  </span>
                  <Badge variant="outline" className="text-xs tabular-nums">
                    {formatFileSize(file.size_bytes || 0)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Field configuration summary */}
      <Section variant="card" title="Field configuration">
        <div className="space-y-2">
          {workflowState.fields.map((field, index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-surface-raised p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {field.field_name}
                </span>
                <Badge variant="secondary">{field.data_type_id}</Badge>
              </div>
              <p className="text-sm text-foreground-muted">
                {field.ai_prompt}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Processing configuration */}
      {isLatestSelected && (
        <Section variant="card" title="Processing configuration">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">
              Processing mode by folder
            </h4>
            <div className="space-y-2">
              {workflowState.taskDefinitions.map((task, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-foreground-muted">
                    {task.path === '/' ? 'Root folder' : task.path} (
                    {task.file_count || 0} {pluralize(task.file_count || 0, 'file')})
                  </span>
                  <Badge variant="secondary">
                    {task.mode === 'individual' ? 'Individual' : 'Combined'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Estimated time callout */}
      <div className="rounded-lg border border-primary/15 bg-primary-soft p-4">
        <div className="flex items-center gap-3">
          <Clock
            className="size-5 text-primary-soft-foreground"
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium text-primary-soft-foreground">
              Estimated processing time: {estimatedTime} {pluralize(estimatedTime, 'minute')}
            </p>
            <p className="text-xs text-primary-soft-foreground/80">
              You&apos;ll be able to monitor progress in real-time on the next
              step.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="mr-1.5 size-4" aria-hidden />
          Back
        </Button>

        <Button
          onClick={handleStartJob}
          disabled={isLoading || readOnly}
          size="lg"
          data-tour="start-processing-button"
        >
          {readOnly ? (
            <>
              <Play className="mr-1.5 size-4" aria-hidden />
              View only
            </>
          ) : isLoading ? (
            <>
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
              Starting job…
            </>
          ) : (
            <>
              <Play className="mr-1.5 size-4" aria-hidden />
              Start processing
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

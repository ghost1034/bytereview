'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import ReviewAndStartStep from '@/components/workflow/steps/ReviewAndStartStep'
import RunSelector from '@/components/jobs/RunSelector'
import { JobWorkflowFrame } from '@/components/workflow/JobWorkflowFrame'
import { Section } from '@/components/ui/section'
import { LoadingState } from '@/components/ui/loading-state'
import { useJobRunSelection } from '@/hooks/useJobRunSelection'
import { apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export default function JobReviewPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const jobId = params.jobId as string

  const {
    runs,
    latestRunId,
    selectedRunId,
    isLoading: runsLoading,
    isReadOnly,
    setSelectedRunId,
    createNewRun,
    isCompleted,
  } = useJobRunSelection({
    jobId,
    enabled: !!user && !!jobId,
  })

  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job', jobId, selectedRunId],
    queryFn: async () => {
      if (!selectedRunId) return null
      return apiClient.getJobDetails(jobId, selectedRunId)
    },
    enabled: !!user && !!jobId && !!selectedRunId,
    staleTime: 5 * 60 * 1000,
  })

  const { data: filesData } = useQuery({
    queryKey: ['job-files', jobId, selectedRunId],
    queryFn: async () => {
      if (!selectedRunId) return null
      return apiClient.getJobFiles(jobId, {
        processable: true,
        runId: selectedRunId,
      })
    },
    enabled: !!user && !!jobId && !!selectedRunId,
    staleTime: 5 * 60 * 1000,
  })

  const isLoading = runsLoading || jobLoading

  const submitJobMutation = useMutation({
    mutationFn: async (jobName?: string) => {
      if (!selectedRunId) throw new Error('No run selected')

      if (jobName && jobName !== job?.name) {
        await apiClient.request<void>(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: jobName }),
        })
      }

      const response = await apiClient.submitJob(jobId, selectedRunId)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['job', jobId, selectedRunId],
      })
      queryClient.invalidateQueries({ queryKey: ['job-runs', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', 'resumable'] })
    },
  })

  const handleJobStarted = async (jobName?: string) => {
    try {
      await submitJobMutation.mutateAsync(jobName)
      toast({
        title: 'Job submitted',
        description: 'Your job has been submitted for processing.',
      })
      router.push(`/dashboard/jobs/${jobId}/processing`)
    } catch (error) {
      let errorMessage = 'Failed to submit job for processing'
      if (error instanceof Error) errorMessage = error.message
      toast({
        title: 'Error submitting job',
        description: errorMessage,
        variant: 'destructive',
      })
    }
  }

  const handleBack = () => {
    router.push(`/dashboard/jobs/${jobId}/fields?run_id=${selectedRunId}`)
  }

  const handleCreateNewRun = async () => {
    try {
      await createNewRun({
        cloneFromRunId: selectedRunId,
        redirectTo: 'upload',
      })
      toast({
        title: 'New run created',
        description: 'Created a new run for this job.',
      })
    } catch (error) {
      console.error('Error creating new run:', error)
      toast({
        title: 'Error',
        description: 'Failed to create new run.',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return <LoadingState variant="page" />
  }

  const files =
    filesData?.files?.map((file: any) => ({
      original_filename: file.original_filename,
      original_path: file.original_path,
      size_bytes: file.file_size_bytes || 0,
      status: file.status,
    })) || []

  const workflowState: any = {
    currentStep: 'review',
    jobId,
    files,
    fields: job?.job_fields || [],
    taskDefinitions: job?.extraction_tasks || [],
    jobName: job?.name,
    templateId: job?.template_id,
  }

  return (
    <JobWorkflowFrame
      step="review"
      jobName={job?.name || 'Job'}
      description="Confirm your settings before starting the extraction. You can come back and add a new run later."
      runSelector={
        runs.length > 0 ? (
          <RunSelector
            jobId={jobId}
            runs={runs}
            latestRunId={latestRunId}
            selectedRunId={selectedRunId}
            onChange={setSelectedRunId}
            onCreateNewRun={handleCreateNewRun}
          />
        ) : undefined
      }
      readOnly={isReadOnly}
      readOnlyMessage={
        isReadOnly
          ? `This run is ${isCompleted ? 'completed' : 'in progress'} and cannot be modified or re-submitted.`
          : undefined
      }
    >
      <Section variant="card" title="Review configuration">
        <ReviewAndStartStep
          workflowState={workflowState}
          onJobStarted={handleJobStarted}
          onBack={handleBack}
          isLoading={submitJobMutation.isPending}
          readOnly={isReadOnly}
          isLatestSelected={selectedRunId === latestRunId}
        />
      </Section>
    </JobWorkflowFrame>
  )
}

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import EnhancedFileUpload from '@/components/workflow/steps/EnhancedFileUpload'
import RunSelector from '@/components/jobs/RunSelector'
import { JobWorkflowFrame } from '@/components/workflow/JobWorkflowFrame'
import { LoadingState } from '@/components/ui/loading-state'
import { useJobRunSelection } from '@/hooks/useJobRunSelection'
import { useToast } from '@/hooks/use-toast'
import { apiClient } from '@/lib/api'

export default function JobUploadPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
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

  const isLoading = runsLoading || jobLoading

  const handleFilesReady = async () => {
    try {
      await apiClient.updateJobConfigStep(jobId, 'fields', selectedRunId)
      router.push(`/dashboard/jobs/${jobId}/fields?run_id=${selectedRunId}`)
    } catch (error) {
      console.error('Error updating config step:', error)
      toast({
        title: 'Navigation error',
        description: 'Failed to update job step, but continuing anyway.',
        variant: 'destructive',
      })
      router.push(`/dashboard/jobs/${jobId}/fields?run_id=${selectedRunId}`)
    }
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

  return (
    <JobWorkflowFrame
      step="upload"
      jobName={job?.name || 'New job'}
      description="Add the documents you want to extract data from. Drag and drop, pick a folder, or pull from Google Drive."
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
          ? `This run is ${isCompleted ? 'completed' : 'in progress'} and cannot be modified. You can view files but cannot upload or remove files.`
          : undefined
      }
    >
      <EnhancedFileUpload
        jobId={jobId}
        runId={selectedRunId}
        onFilesReady={handleFilesReady}
        readOnly={isReadOnly}
        isLatestSelected={selectedRunId === latestRunId}
      />
    </JobWorkflowFrame>
  )
}

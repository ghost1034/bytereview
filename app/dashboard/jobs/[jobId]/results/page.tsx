'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import RunSelector from '@/components/jobs/RunSelector'
import { JobWorkflowFrame } from '@/components/workflow/JobWorkflowFrame'
import { Section } from '@/components/ui/section'
import { LoadingState } from '@/components/ui/loading-state'
import ResultsStep from '@/components/workflow/steps/ResultsStep'
import { useJobRunSelection } from '@/hooks/useJobRunSelection'
import { apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export default function JobResultsPage() {
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
    setSelectedRunId,
    createNewRun,
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

  const handleStartNew = () => {
    router.push('/dashboard/jobs/create')
  }

  const handleCreateNewRun = async (opts?: { appendResults?: boolean }) => {
    try {
      await createNewRun({
        cloneFromRunId: selectedRunId,
        redirectTo: 'upload',
        appendResults: opts?.appendResults ?? false,
      })
      toast({
        title: 'New run created',
        description: 'Created a new run for this job. Upload files and configure extraction next.',
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
      step="results"
      jobName={job?.name || 'Job'}
      description="Review and export your extracted data. Edit cells inline or download as CSV / XLSX."
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
    >
      <Section variant="card" title="Extraction results">
        <ResultsStep
          jobId={jobId}
          runId={selectedRunId}
          onStartNew={handleStartNew}
        />
      </Section>
    </JobWorkflowFrame>
  )
}

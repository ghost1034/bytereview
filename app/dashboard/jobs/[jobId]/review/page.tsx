'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ReviewAndStartStep from '@/components/workflow/steps/ReviewAndStartStep'
import RunSelector from '@/components/jobs/RunSelector'
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

  // Job run selection
  const {
    runs,
    latestRunId,
    selectedRunId,
    selectedRun,
    isLoading: runsLoading,
    isReadOnly,
    setSelectedRunId,
    createNewRun,
    canEdit,
    isCompleted
  } = useJobRunSelection({ 
    jobId,
    enabled: !!user && !!jobId 
  })

  // Fetch job data for the selected run
  const { data: job, isLoading: jobLoading } = useQuery({
    queryKey: ['job', jobId, selectedRunId],
    queryFn: async () => {
      if (!selectedRunId) return null
      return apiClient.getJobDetails(jobId, selectedRunId)
    },
    enabled: !!user && !!jobId && !!selectedRunId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch job files for the selected run
  const { data: filesData } = useQuery({
    queryKey: ['job-files', jobId, selectedRunId],
    queryFn: async () => {
      if (!selectedRunId) return null
      return apiClient.getJobFiles(jobId, { processable: true, runId: selectedRunId })
    },
    enabled: !!user && !!jobId && !!selectedRunId,
    staleTime: 5 * 60 * 1000, // 5 minutes - invalidated when files are added/removed
  })

  const isLoading = runsLoading || jobLoading

  // Submit job mutation
  const submitJobMutation = useMutation({
    mutationFn: async (jobName?: string) => {
      if (!selectedRunId) throw new Error('No run selected')
      
      // Update job name if provided (job-level, not run-level)
      if (jobName && jobName !== job?.name) {
        await apiClient.request(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: jobName })
        })
      }
      
      // Submit job run for processing
      console.log('Submitting job run for processing:', selectedRunId)
      const response = await apiClient.submitJob(jobId, selectedRunId)
      
      console.log('Job run submitted successfully:', response.job_run_id)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId, selectedRunId] })
      queryClient.invalidateQueries({ queryKey: ['job-runs', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', 'resumable'] })
    }
  })

  const handleJobStarted = async (jobName?: string, templateId?: string) => {
    try {
      await submitJobMutation.mutateAsync(jobName)
      
      toast({
        title: "Job submitted",
        description: "Your job has been submitted for processing!"
      })
      
      // Navigate to processing page (no run_id needed - processing always shows latest)
      router.push(`/dashboard/jobs/${jobId}/processing`);
    } catch (error) {
      // Extract the actual error message from the error object
      let errorMessage = "Failed to submit job for processing"
      
      if (error instanceof Error) {
        errorMessage = error.message
      }
      
      toast({
        title: "Error submitting job",
        description: errorMessage,
        variant: "destructive"
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
        redirectTo: 'upload' 
      })
      toast({
        title: "New Run Created",
        description: "Created a new run for this job."
      })
    } catch (error) {
      console.error('Error creating new run:', error)
      toast({
        title: "Error",
        description: "Failed to create new run.",
        variant: "destructive"
      })
    }
  }

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading...</div>
  }

  // Convert files to expected format
  const files = filesData?.files?.map((file: any) => ({
    file_id: file.id,
    filename: file.original_filename,
    original_filename: file.original_filename,
    original_path: file.original_path,
    size_bytes: file.file_size_bytes || 0,
    status: file.status
  })) || []

  // Create workflow state for ReviewAndStartStep
  const workflowState = {
    currentStep: 'review' as const,
    jobId: jobId,
    files: files,
    fields: job?.job_fields || [],
    taskDefinitions: job?.extraction_tasks || [],
    jobName: job?.name,
    templateId: job?.template_id,
    persistData: true
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Review & Start</h1>
        <p className="text-muted-foreground">
          Review your settings and start the extraction process
        </p>
      </div>

      {/* Progress indicator */}
      <div className="text-center text-sm text-muted-foreground">
        Step 3 of 3
      </div>

      {/* Run Selector */}
      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Job Run Selection
              {isReadOnly && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleCreateNewRun}
                >
                  Create New Run
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RunSelector
              jobId={jobId}
              runs={runs}
              latestRunId={latestRunId}
              selectedRunId={selectedRunId}
              onChange={setSelectedRunId}
            />
          </CardContent>
        </Card>
      )}

      {/* Read-only Alert */}
      {isReadOnly && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This run is {isCompleted ? 'completed' : 'in progress'} and cannot be modified or re-submitted. 
            You can review the configuration but cannot start processing again. 
            Create a new run to process with different settings.
          </AlertDescription>
        </Alert>
      )}

      {/* Review Step */}
      <Card>
        <CardHeader>
          <CardTitle>Review Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <ReviewAndStartStep
            workflowState={workflowState}
            onJobStarted={handleJobStarted}
            onBack={handleBack}
            isLoading={submitJobMutation.isPending}
            readOnly={isReadOnly}
          />
        </CardContent>
      </Card>

    </div>
  )
}
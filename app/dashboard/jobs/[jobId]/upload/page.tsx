'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import EnhancedFileUpload from '@/components/workflow/steps/EnhancedFileUpload';
import RunSelector from '@/components/jobs/RunSelector';
import { useJobRunSelection } from '@/hooks/useJobRunSelection';
import { useToast } from '@/hooks/use-toast'
import { apiClient } from '@/lib/api'

async function getAuthToken(user: any): Promise<string> {
  if (!user) throw new Error('User not authenticated')
  return await user.getIdToken()
}

export default function JobUploadPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const isLoading = runsLoading || jobLoading

  const handleFilesReady = async (files: any[]) => {
    // Files are ready for the next step
    console.log('Files ready:', files.length, 'files uploaded/imported')
    
    try {
      // Update config step to fields for the selected run
      await apiClient.updateJobConfigStep(jobId, 'fields', selectedRunId)
      
      // Navigate to next step with run_id
      router.push(`/dashboard/jobs/${jobId}/fields?run_id=${selectedRunId}`)
    } catch (error) {
      console.error('Error updating config step:', error)
      toast({
        title: "Navigation Error",
        description: "Failed to update job step, but continuing anyway.",
        variant: "destructive"
      })
      // Still navigate even if step update fails
      router.push(`/dashboard/jobs/${jobId}/fields?run_id=${selectedRunId}`)
    }
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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Upload Files</h1>
        <p className="text-muted-foreground">
          Select and upload your documents for data extraction
        </p>
      </div>

      {/* Progress indicator */}
      <div className="text-center text-sm text-muted-foreground">
        Step 1 of 3
      </div>

      {/* Run Selector */}
      {runs.length > 0 && (
        <div className="flex items-center justify-center gap-3">
          <label className="text-sm font-medium text-gray-700">Job Run:</label>
          <RunSelector
            jobId={jobId}
            runs={runs}
            latestRunId={latestRunId}
            selectedRunId={selectedRunId}
            onChange={setSelectedRunId}
            onCreateNewRun={handleCreateNewRun}
          />
        </div>
      )}

      {/* Read-only Alert */}
      {isReadOnly && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This run is {isCompleted ? 'completed' : 'in progress'} and cannot be modified. 
            You can view the files but cannot upload or remove files. 
          </AlertDescription>
        </Alert>
      )}

      {/* Enhanced File Upload with Multi-Source Support */}
      <EnhancedFileUpload
        jobId={jobId}
        runId={selectedRunId}
        onFilesReady={handleFilesReady}
        readOnly={isReadOnly}
        isLatestSelected={selectedRunId === latestRunId}
      />

    </div>
  )
}
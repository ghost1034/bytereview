'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Settings, Plus } from 'lucide-react'
import ResultsStep from '@/components/workflow/steps/ResultsStep'
import RunSelector from '@/components/jobs/RunSelector'
import { useJobRunSelection } from '@/hooks/useJobRunSelection'
import { apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export default function JobResultsPage() {
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
    staleTime: 5 * 60 * 1000,
  })

  const isLoading = runsLoading || jobLoading

  const handleStartNew = () => {
    router.push('/dashboard/jobs/create')
  }

  const handleAddMoreFiles = () => {
    router.push(`/dashboard/jobs/${jobId}/upload?run_id=${selectedRunId}`)
  }

  const handleCreateNewRun = async () => {
    try {
      await createNewRun({ 
        cloneFromRunId: selectedRunId,
        redirectTo: 'upload' 
      })
      toast({
        title: "New Run Created",
        description: "Created a new run for this job. You can now upload files and configure extraction."
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
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Results</h1>
          <p className="text-muted-foreground">
            View and export your extracted data
          </p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-center gap-3">
          <Button 
            onClick={handleCreateNewRun}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Run
          </Button>
          <Button 
            onClick={handleAddMoreFiles}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            {canEdit ? 'Reconfigure Run' : 'View Configuration'}
          </Button>
        </div>
      </div>

      {/* Run Selector */}
      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Job Run Selection</CardTitle>
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

      {/* Results Step */}
      <Card>
        <CardHeader>
          <CardTitle>Extraction Results</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultsStep
            jobId={jobId}
            runId={selectedRunId}
            onStartNew={handleStartNew}
          />
        </CardContent>
      </Card>

    </div>
  )
}
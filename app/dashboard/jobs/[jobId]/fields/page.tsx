'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import FieldConfigurationStep from '@/components/workflow/steps/FieldConfigurationStep'
import RunSelector from '@/components/jobs/RunSelector'
import { useJobRunSelection } from '@/hooks/useJobRunSelection'
import { JobFieldConfig, TaskDefinition, apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export default function JobFieldsPage() {
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

  // Save field configuration mutation
  const saveFieldsMutation = useMutation({
    mutationFn: async ({ fields, templateId, processingModes, description }: { 
      fields: JobFieldConfig[], 
      templateId?: string,
      processingModes?: Record<string, string>,
      description?: string,
    }) => {
      if (!selectedRunId) throw new Error('No run selected')
      return apiClient.updateJobFields(jobId, fields, templateId, processingModes, selectedRunId, description)
    },
    onSuccess: () => {
      // Invalidate job data to refresh
      queryClient.invalidateQueries({ queryKey: ['job', jobId, selectedRunId] })
    }
  })

  // Common function to save field configuration
  const saveFieldConfiguration = async (fields: JobFieldConfig[], taskDefinitions: TaskDefinition[], templateId?: string, description?: string) => {
    // Extract processing modes from task definitions
    const processingModes: Record<string, string> = {}
    taskDefinitions.forEach(task => {
      if (task.path && task.mode) {
        processingModes[task.path] = task.mode
      }
    })
    
    // Save field configuration and processing modes
    await saveFieldsMutation.mutateAsync({ 
      fields, 
      templateId,
      processingModes,
      description
    })
  }

  const handleFieldsSaved = async (fields: JobFieldConfig[], taskDefinitions: TaskDefinition[], templateId?: string, description?: string) => {
    try {
      await saveFieldConfiguration(fields, taskDefinitions, templateId, description)
      
      toast({
        title: "Configuration saved",
        description: "Field configuration has been saved successfully"
      })
    } catch (error) {
      toast({
        title: "Error saving configuration",
        description: "Failed to save configuration",
        variant: "destructive"
      })
    }
  }

  const handleContinue = async () => {
    try {
      // Update config step to review and navigate
      await apiClient.updateJobConfigStep(jobId, 'review', selectedRunId)
      
      toast({
        title: "Ready for review",
        description: "Configuration saved. Ready to start processing."
      })
      
      // Navigate to next step with run_id
      router.push(`/dashboard/jobs/${jobId}/review?run_id=${selectedRunId}`)
    } catch (error) {
      toast({
        title: "Error proceeding",
        description: "Failed to proceed to next step",
        variant: "destructive"
      })
    }
  }

  const handleBack = () => {
    router.push(`/dashboard/jobs/${jobId}/upload?run_id=${selectedRunId}`)
  }

  const handleCreateNewRun = async () => {
    try {
      await createNewRun({ 
        cloneFromRunId: selectedRunId,
        redirectTo: 'fields' 
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
    size_bytes: file.file_size_bytes,
    status: file.status
  })) || []


  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Configure Fields</h1>
        <p className="text-muted-foreground">
          Define what data to extract from your documents
        </p>
      </div>

      {/* Progress indicator */}
      <div className="text-center text-sm text-muted-foreground">
        Step 2 of 3
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
            You can view the field configuration but cannot make changes. 
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Step */}
      <Card>
        <CardHeader>
          <CardTitle>Field Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldConfigurationStep
            files={files}
            initialFields={job?.job_fields || []}
            initialTaskDefinitions={job?.extraction_tasks || []}
            initialTemplateId={job?.template_id}
            initialDescription={(job as any)?.description}
            onFieldsSaved={handleFieldsSaved}
            onContinue={handleContinue}
            onBack={handleBack}
            readOnly={isReadOnly}
          />
        </CardContent>
      </Card>

    </div>
  )
}
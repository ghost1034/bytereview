'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import FieldConfigurationStep from '@/components/workflow/steps/FieldConfigurationStep'
import RunSelector from '@/components/jobs/RunSelector'
import { JobWorkflowFrame } from '@/components/workflow/JobWorkflowFrame'
import { Section } from '@/components/ui/section'
import { LoadingState } from '@/components/ui/loading-state'
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

  const saveFieldsMutation = useMutation({
    mutationFn: async ({
      fields,
      templateId,
      processingModes,
      description,
    }: {
      fields: JobFieldConfig[]
      templateId?: string
      processingModes?: Record<string, string>
      description?: string
    }) => {
      if (!selectedRunId) throw new Error('No run selected')
      return apiClient.updateJobFields(
        jobId,
        fields,
        templateId,
        processingModes,
        selectedRunId,
        description,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['job', jobId, selectedRunId],
      })
    },
  })

  const saveFieldConfiguration = async (
    fields: JobFieldConfig[],
    taskDefinitions: TaskDefinition[],
    templateId?: string,
    description?: string,
  ) => {
    const processingModes: Record<string, string> = {}
    taskDefinitions.forEach((task) => {
      if (task.path && task.mode) {
        processingModes[task.path] = task.mode
      }
    })
    await saveFieldsMutation.mutateAsync({
      fields,
      templateId,
      processingModes,
      description,
    })
  }

  const handleFieldsSaved = async (
    fields: JobFieldConfig[],
    taskDefinitions: TaskDefinition[],
    templateId?: string,
    description?: string,
  ) => {
    try {
      await saveFieldConfiguration(
        fields,
        taskDefinitions,
        templateId,
        description,
      )
      toast({
        title: 'Configuration saved',
        description: 'Field configuration has been saved successfully.',
      })
    } catch (error) {
      toast({
        title: 'Error saving configuration',
        description: 'Failed to save configuration.',
        variant: 'destructive',
      })
    }
  }

  const handleContinue = async () => {
    try {
      await apiClient.updateJobConfigStep(jobId, 'review', selectedRunId)
      toast({
        title: 'Ready for review',
        description: 'Configuration saved. Ready to start processing.',
      })
      router.push(`/dashboard/jobs/${jobId}/review?run_id=${selectedRunId}`)
    } catch (error) {
      toast({
        title: 'Error proceeding',
        description: 'Failed to proceed to next step.',
        variant: 'destructive',
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
        redirectTo: 'fields',
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
      file_id: file.id,
      filename: file.original_filename,
      original_filename: file.original_filename,
      original_path: file.original_path,
      size_bytes: file.file_size_bytes,
      status: file.status,
    })) || []

  return (
    <JobWorkflowFrame
      step="fields"
      jobName={job?.name || 'Job'}
      description="Define the fields you want extracted from each document. Add a clear name, pick a data type, and describe what to look for."
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
          ? `This run is ${isCompleted ? 'completed' : 'in progress'} and cannot be modified.`
          : undefined
      }
    >
      <Section variant="card" title="Field configuration">
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
          showAutomationTip={
            !!(
              job?.job_fields &&
              job.job_fields.length > 0 &&
              !isCompleted
            )
          }
        />
      </Section>
    </JobWorkflowFrame>
  )
}

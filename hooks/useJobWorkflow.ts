import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useUpdateConfigStep, useSubmitJob } from '@/hooks/useJobs'
import { apiClient } from '@/lib/api'

interface Job {
  id: string
  name?: string
  config_step: string
  status: string
  progress_percentage?: number
  tasks_completed?: number
  tasks_total?: number
  tasks_failed?: number
  is_resumable?: boolean
  version?: number
  source_files?: any[]
  job_fields?: any[]
}

export interface WorkflowState {
  currentStep: 'upload' | 'fields' | 'review'
  completedSteps: string[]
  uploadedFiles: any[]
  fields: any[]
  taskDefinitions: any[]
  templateId?: string
  jobName?: string
}

export interface ProgressInfo {
  type: 'wizard' | 'processing'
  percentage: number
  current_step?: string
  completed?: number
  total?: number
  failed?: number
  can_resume: boolean
}

/**
 * Enhanced hook for managing job workflow with resumable functionality
 */
export function useJobWorkflow(jobId: string, initialStep?: string | null) {
  const [job, setJob] = useState<Job | null>(null)
  const [workflowState, setWorkflowState] = useState<WorkflowState>({
    currentStep: 'upload',
    completedSteps: [],
    uploadedFiles: [],
    fields: [],
    taskDefinitions: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const updateConfigStepMutation = useUpdateConfigStep()
  const submitJobMutation = useSubmitJob()
  
  // SSE will be used only for specific steps (ZIP extraction and processing)
  // No general job workflow SSE for now

  // Load existing job or create new one (only when user is authenticated)
  useEffect(() => {
    if (!user) return // Wait for authentication
    
    if (jobId) {
      loadExistingJob(jobId)
    } else {
      createNewJob()
    }
  }, [jobId, user])

  // Initialize workflow state based on job data and URL parameter
  useEffect(() => {
    if (job && !isLoading) {
      // Use initialStep parameter if provided, otherwise use job's config_step
      const targetStep = initialStep ? getWorkflowStep(initialStep) : getWorkflowStep(job.config_step)
      
      // Load full file data if we have a job
      loadJobFiles(job.id)
      
      setWorkflowState(prev => ({
        ...prev,
        currentStep: targetStep,
        completedSteps: getCompletedSteps(job),
        uploadedFiles: [], // Will be populated by loadJobFiles
        fields: job.job_fields || [],
        taskDefinitions: job.extraction_tasks || [],
        templateId: job.template_id,
        jobName: job.name
      }))
    }
  }, [job, isLoading, initialStep])

  const loadJobFiles = async (jobId: string) => {
    try {
      const token = await getAuthToken(user)
      const response = await fetch(`/api/jobs/${jobId}/files?processable=true`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to load job files')
      }
      
      const filesData = await response.json()
      
      // Convert JobFileInfo to UploadedFile format expected by components
      const uploadedFiles = filesData.files.map((file: any) => ({
        file_id: file.id,
        filename: file.original_filename,
        original_filename: file.original_filename,
        original_path: file.original_path,
        size_bytes: file.file_size_bytes,
        status: file.status
      }))
      
      setWorkflowState(prev => ({
        ...prev,
        uploadedFiles
      }))
      
    } catch (error) {
      console.error('Error loading job files:', error)
      toast({
        title: "Error loading files",
        description: "Failed to load job files. Some features may not work correctly.",
        variant: "destructive"
      })
    }
  }

  const loadExistingJob = async (id: string) => {
    setIsLoading(true)
    try {
      const token = await getAuthToken(user)
      const response = await fetch(`/api/jobs/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to load job')
      }
      
      const jobData = await response.json()
      setJob(jobData)
      
      // Note: workflow state will be set in the separate useEffect that handles initialStep
      
    } catch (error) {
      console.error('Error loading job:', error)
      toast({
        title: "Error loading job",
        description: "Failed to load job data. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const createNewJob = async () => {
    setIsLoading(true)
    try {
      const token = await getAuthToken(user)
      const response = await fetch('/api/jobs/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({})
      })
      
      if (!response.ok) {
        throw new Error('Failed to create job')
      }
      
      const jobData = await response.json()
      setJob(jobData)
      
      // Update URL to include job ID
      router.replace(`/dashboard/jobs/create?jobId=${jobData.id}`)
      
    } catch (error) {
      console.error('Error creating job:', error)
      toast({
        title: "Error creating job",
        description: "Failed to create new job. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const updateStep = useCallback(async (nextStep: 'upload' | 'fields' | 'review') => {
    if (!job) return

    try {
      await updateConfigStepMutation.mutateAsync({
        jobId: job.id,
        update: {
          config_step: nextStep,
          version: job.version
        }
      })

      // Update local state immediately for responsive UI
      setWorkflowState(prev => ({
        ...prev,
        currentStep: nextStep,
        completedSteps: [...prev.completedSteps.filter(s => s !== nextStep), prev.currentStep]
      }))

      setJob(prev => prev ? { ...prev, config_step: nextStep, version: (prev.version || 0) + 1 } : null)

    } catch (error: any) {
      toast({
        title: "Error updating step",
        description: error.message || "Failed to update workflow step",
        variant: "destructive"
      })
    }
  }, [job, updateConfigStepMutation, toast])

  const submitForProcessing = useCallback(async () => {
    if (!job) return

    try {
      await submitJobMutation.mutateAsync(job.id)
      
      toast({
        title: "Job submitted",
        description: "Your job has been submitted for processing!"
      })

      // Navigate to job details page
      router.push(`/dashboard/jobs/${job.id}`)

    } catch (error: any) {
      toast({
        title: "Error submitting job",
        description: error.message || "Failed to submit job for processing",
        variant: "destructive"
      })
    }
  }, [job, submitJobMutation, toast, router])

  const updateWorkflowData = useCallback(async (updates: Partial<WorkflowState>) => {
    setWorkflowState(prev => ({ ...prev, ...updates }))
    
    // Auto-save workflow data and wait for completion
    if (job) {
      await autoSaveWorkflowData({ ...workflowState, ...updates })
    }
  }, [job, workflowState])

  const autoSaveWorkflowData = useCallback(async (state: WorkflowState) => {
    if (!job || autoSaving) return

    setAutoSaving(true)
    try {
      const token = await getAuthToken(user)
      
      // Save field configuration data if it exists
      if (state.fields && state.fields.length > 0) {
        await fetch(`/api/jobs/${job.id}/fields`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            fields: state.fields,
            template_id: state.templateId
          })
        })
      }
      
      // Save job name if it exists and is different
      if (state.jobName && state.jobName !== job.name) {
        await fetch(`/api/jobs/${job.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: state.jobName
          })
        })
      }
      
      
    } catch (error) {
      console.error('Auto-save failed:', error)
      // Don't show error toast for auto-save failures to avoid annoying users
    } finally {
      setAutoSaving(false)
    }
  }, [job, autoSaving, user])

  const getProgressInfo = useCallback((jobData: Job): ProgressInfo => {
    if (jobData.config_step !== 'submitted') {
      // Wizard progress
      const stepIndex = ['upload', 'fields', 'review'].indexOf(jobData.config_step as any)
      return {
        type: 'wizard',
        percentage: ((stepIndex + 1) / 3) * 100,
        current_step: jobData.config_step,
        can_resume: true
      }
    } else {
      // Processing progress
      const percentage = jobData.tasks_total > 0 
        ? (jobData.tasks_completed / jobData.tasks_total) * 100 
        : 0
      return {
        type: 'processing',
        percentage,
        completed: jobData.tasks_completed,
        total: jobData.tasks_total,
        failed: jobData.tasks_failed,
        can_resume: jobData.is_resumable
      }
    }
  }, [])

  return {
    job,
    workflowState,
    isLoading,
    autoSaving,
    updateStep,
    updateWorkflowData,
    submitForProcessing,
    getProgressInfo: job ? () => getProgressInfo(job) : () => ({ type: 'wizard' as const, percentage: 0, can_resume: true }),
    isSubmitting: submitJobMutation.isPending,
    isUpdatingStep: updateConfigStepMutation.isPending
  }
}

// Helper functions
function getWorkflowStep(configStep: string): 'upload' | 'fields' | 'review' {
  switch (configStep) {
    case 'fields': return 'fields'
    case 'review': return 'review'
    default: return 'upload'
  }
}

function getCompletedSteps(job: any): string[] {
  const steps = []
  if (job.source_files?.length > 0) steps.push('upload')
  if (job.job_fields?.length > 0) steps.push('fields')
  return steps
}

async function getAuthToken(user: any): Promise<string> {
  if (!user) {
    throw new Error('User not authenticated')
  }
  
  try {
    // Get the Firebase ID token
    const token = await user.getIdToken()
    return token
  } catch (error) {
    console.error('Error getting auth token:', error)
    throw new Error('Failed to get authentication token')
  }
}
/**
 * React hooks for job-based workflow
 * New asynchronous extraction workflow
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import {
  JobInitiateResponse,
  JobStartResponse,
  JobDetailsResponse,
  JobListResponse,
  JobProgressResponse,
  JobResultsResponse,
  UploadedFile,
  JobFieldConfig,
  TaskDefinition
} from '@/lib/api'

/**
 * Hook to initiate a new job
 */
export function useInitiateJob() {
  return useMutation({
    mutationFn: (request: { files: { filename: string; path: string; size: number; type: string }[] }) => apiClient.initiateJob(request),
  })
}

/**
 * Hook to upload files with progress tracking
 */
export function useUploadFiles() {
  return useMutation({
    mutationFn: ({
      files,
      onProgress
    }: {
      files: UploadedFile[]
      onProgress?: (fileIndex: number, progress: number) => void
    }) => { throw new Error('uploadFiles method removed - use addFilesToJob instead') },
  })
}

/**
 * Hook for complete workflow: initiate job and upload files
 */
export function useInitiateAndUploadFiles() {
  return useMutation({
    mutationFn: ({
      files,
      onProgress
    }: {
      files: File[]
      onProgress?: (fileIndex: number, progress: number) => void
    }) => { throw new Error('initiateAndUploadFiles method removed - use initiateJob + addFilesToJob instead') },
  })
}

/**
 * Hook to get job details
 */
export function useJobDetails(jobId: string | undefined, runId?: string) {
  return useQuery<JobDetailsResponse>({
    queryKey: ['job', jobId, runId],
    queryFn: () => apiClient.getJobDetails(jobId!, runId),
    enabled: !!jobId,
    refetchInterval: (data) => {
      // Poll every 2 seconds if job is processing
      return data?.status === 'processing' ? 2000 : false
    },
  })
}

/**
 * Hook to list user jobs
 */
export function useJobs(limit = 25, offset = 0, status?: string) {
  const { user } = useAuth()
  
  return useQuery<JobListResponse>({
    queryKey: ['jobs', user?.uid, limit, offset, status],
    queryFn: () => {
      console.log('[JOBS] API call triggered at', new Date().toLocaleTimeString())
      return apiClient.listJobs({ limit, offset, status })
    },
    enabled: !!user,
    staleTime: 0, // TODO: Implement proper staleTime and invalidation
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    refetchOnMount: true, // Always refetch when component mounts
    onSuccess: (data) => {
      const activeJobs = data?.jobs?.filter(job => job.status === 'in_progress') || []
      console.log(`[JOBS] Data loaded: ${data?.jobs?.length || 0} total, ${activeJobs.length} active`)
    },
    onError: (error) => {
      console.error('[JOBS] API error:', error)
    }
  })
}

/**
 * Hook to get jobs for automation selection (includes field configuration status)
 */
export function useJobsForAutomation(limit = 100, offset = 0) {
  const { user } = useAuth()
  
  return useQuery<JobListResponse>({
    queryKey: ['jobs', 'for-automation', user?.uid, limit, offset],
    queryFn: () => {
      console.log('[JOBS] Automation jobs API call triggered at', new Date().toLocaleTimeString())
      return apiClient.listJobs({ limit, offset, include_field_status: true })
    },
    enabled: !!user,
    staleTime: 0, // TODO: Implement proper staleTime and invalidation
    refetchOnWindowFocus: false, // Don't refetch on focus for modal usage
    refetchOnMount: true,
    onSuccess: (data) => {
      console.log('[JOBS] Automation jobs API response received:', data)
    },
    onError: (error) => {
      console.error('[JOBS] Automation jobs API error:', error)
    }
  })
}

/**
 * Hook to get job progress with real-time updates
 */
export function useJobProgress(jobId: string | undefined) {
  return useQuery<JobProgressResponse>({
    queryKey: ['job-progress', jobId],
    queryFn: () => apiClient.getJobProgress(jobId!),
    enabled: !!jobId,
    refetchInterval: (data) => {
      // Poll every 1 second if job is processing
      return data?.status === 'processing' ? 1000 : false
    },
  })
}

/**
 * Hook to get job results
 */
export function useJobResults(jobId: string | undefined, limit = 50, runId?: string) {
  return useQuery<JobResultsResponse>({
    queryKey: ['job-results', jobId, limit, runId],
    queryFn: () => apiClient.getJobResults(jobId!, { limit, runId }),
    enabled: !!jobId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook for job workflow state management
 */
export function useJobWorkflow() {
  const queryClient = useQueryClient()
  
  const initiateJob = useInitiateJob()
  const uploadFiles = useUploadFiles()
  
  const initiateAndUpload = useMutation({
    mutationFn: async ({
      files,
      onProgress
    }: {
      files: File[]
      onProgress?: (fileIndex: number, progress: number) => void
    }) => {
      throw new Error('initiateAndUploadFiles method removed - use initiateJob + addFilesToJob instead')
    },
    onSuccess: () => {
      // Invalidate jobs list after successful initiation
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
  
  const completeJob = useMutation({
    mutationFn: async ({
      jobId,
      jobName,
      templateId,
      persistData,
      fields,
      taskDefinitions
    }: {
      jobId: string
      jobName?: string
      templateId?: string
      persistData: boolean
      fields: any[]
      taskDefinitions: any[]
    }) => {
      return apiClient.startJob(jobId, {
        name: jobName,
        template_id: templateId,
        persist_data: persistData,
        fields,
        task_definitions: taskDefinitions
      })
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
  
  return {
    initiateJob,
    uploadFiles,
    startJob,
    initiateAndUpload,
    completeJob,
    
    // Combined state
    isLoading: initiateJob.isPending || uploadFiles.isPending || startJob.isPending || 
               initiateAndUpload.isPending || completeJob.isPending,
    error: initiateJob.error || uploadFiles.error || startJob.error || 
           initiateAndUpload.error || completeJob.error,
  }
}

/**
 * Hook for updating job configuration step
 */
export function useUpdateConfigStep() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ jobId, update }: { jobId: string; update: { config_step: string; version?: number } }) => {
      const token = await getAuthToken(user)
      const response = await fetch(`/api/jobs/${jobId}/config-step`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(update)
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to update configuration step')
      }
      
      return response.json()
    },
    onSuccess: () => {
      // Invalidate job queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    }
  })
}

/**
 * Hook for submitting job for processing
 */
export function useSubmitJob() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (jobId: string) => {
      const token = await getAuthToken(user)
      const response = await fetch(`/api/jobs/${jobId}/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Failed to submit job')
      }
      
      return response.json()
    },
    onSuccess: () => {
      // Invalidate all job queries
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    }
  })
}

/**
 * Helper function to get Firebase auth token
 */
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

// Re-export types for convenience
export type {
  JobInitiateResponse,
  JobStartResponse,
  JobDetailsResponse,
  JobListResponse,
  JobProgressResponse,
  UploadedFile,
  JobFieldConfig,
  TaskDefinition
} from '@/lib/api'

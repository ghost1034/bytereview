/**
 * React hooks for job-based workflow
 * New asynchronous extraction workflow
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { apiClient } from '@/lib/api'
import {
  JobInitiateResponse,
  JobStartResponse,
  JobDetailsResponse,
  JobListResponse,
  JobProgressResponse,
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
 * Hook to start job processing
 */
export function useStartJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ jobId, request }: { jobId: string; request: JobStartRequest }) =>
      apiClient.startJob(jobId, request),
    onSuccess: (_, { jobId }) => {
      // Invalidate job details and list
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
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
export function useJobDetails(jobId: string | undefined) {
  return useQuery<JobDetailsResponse>({
    queryKey: ['job', jobId],
    queryFn: () => apiClient.getJobDetails(jobId!),
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
    queryFn: () => apiClient.listJobs({ limit, offset, status }),
    enabled: !!user,
    staleTime: 30 * 1000, // 30 seconds
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
export function useJobResults(jobId: string | undefined, limit = 50, offset = 0) {
  return useQuery<JobResultsResponse>({
    queryKey: ['job-results', jobId, limit, offset],
    queryFn: () => { throw new Error('getJobResults not implemented yet') },
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
  const startJob = useStartJob()
  
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
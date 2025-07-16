/**
 * React hooks for job-based workflow
 * New asynchronous extraction workflow
 */
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { jobApiClient } from '@/lib/job-api'
import {
  JobInitiateRequest,
  JobStartRequest,
  JobDetailsResponse,
  JobListResponse,
  JobProgressResponse,
  JobResultsResponse,
  UploadedFile
} from '@/lib/job-types'

/**
 * Hook to initiate a new job
 */
export function useInitiateJob() {
  return useMutation({
    mutationFn: (request: JobInitiateRequest) => jobApiClient.initiateJob(request),
  })
}

/**
 * Hook to start job processing
 */
export function useStartJob() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ jobId, request }: { jobId: string; request: JobStartRequest }) =>
      jobApiClient.startJob(jobId, request),
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
    }) => jobApiClient.uploadFiles(files, onProgress),
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
    }) => jobApiClient.initiateAndUploadFiles(files, onProgress),
  })
}

/**
 * Hook to get job details
 */
export function useJobDetails(jobId: string | undefined) {
  return useQuery<JobDetailsResponse>({
    queryKey: ['job', jobId],
    queryFn: () => jobApiClient.getJobDetails(jobId!),
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
    queryFn: () => jobApiClient.listJobs(limit, offset, status),
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
    queryFn: () => jobApiClient.getJobProgress(jobId!),
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
    queryFn: () => jobApiClient.getJobResults(jobId!, limit, offset),
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
      return jobApiClient.initiateAndUploadFiles(files, onProgress)
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
      return jobApiClient.startJob(jobId, {
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
  JobInitiateRequest,
  JobStartRequest,
  JobDetailsResponse,
  JobListResponse,
  JobProgressResponse,
  JobResultsResponse,
  UploadedFile
} from '@/lib/job-types'
/**
 * File Upload Step for Job Workflow
 * Uses the enhanced upload component with real-time updates
 */
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { apiClient, UploadedFile } from '@/lib/api'
import EnhancedFileUpload from '@/components/upload/EnhancedFileUpload'

interface FileUploadStepProps {
  jobId?: string // Accept an existing job ID instead of creating one
  onFilesUploaded: (jobId: string, files: UploadedFile[]) => void
  isLoading?: boolean
}

export default function FileUploadStep({ jobId: providedJobId, onFilesUploaded, isLoading }: FileUploadStepProps) {
  const { toast } = useToast()
  
  // Use provided jobId or show message that one is needed
  if (!providedJobId) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-gray-600">No job selected. Please create a job first.</p>
        </div>
      </div>
    )
  }

  // Handle when files are ready for configuration
  const handleFilesReady = (files: UploadedFile[]) => {
    onFilesUploaded(providedJobId, files)
  }

  return (
    <EnhancedFileUpload
      jobId={providedJobId}
      onFilesReady={handleFilesReady}
    />
  )
}
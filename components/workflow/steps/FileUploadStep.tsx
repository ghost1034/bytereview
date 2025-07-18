/**
 * File Upload Step for Job Workflow
 * Uses the enhanced upload component with real-time updates
 */
'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import { apiClient } from '@/lib/api'
import EnhancedFileUpload from '@/components/upload/EnhancedFileUpload'

interface FileUploadStepProps {
  onFilesUploaded: (jobId: string, files: UploadedFile[]) => void
  isLoading?: boolean
}

interface UploadedFile {
  id: string
  filename: string
  original_path: string
  file_type: string
  file_size: number
  status: 'ready' | 'extracting' | 'extracted' | 'failed'
}

export default function FileUploadStep({ onFilesUploaded, isLoading }: FileUploadStepProps) {
  const { toast } = useToast()
  const [jobId, setJobId] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)
  const initializationRef = useRef(false) // Prevent React Strict Mode double initialization

  // Initialize job when component mounts
  useEffect(() => {
    const initializeJob = async () => {
      // Prevent double initialization in React Strict Mode
      if (initializationRef.current || jobId || initializing) return
      
      initializationRef.current = true
      setInitializing(true)
      
      try {
        console.log('Initializing new job...')
        // Create a job with no initial files
        const response = await apiClient.initiateJob({ files: [] })
        const newJobId = response.job_id
        console.log('Job initialized:', newJobId)
        setJobId(newJobId)
      } catch (error) {
        console.error('Failed to initialize job:', error)
        initializationRef.current = false // Reset on error
        toast({
          title: "Initialization failed",
          description: "Failed to create job. Please try again.",
          variant: "destructive"
        })
      } finally {
        setInitializing(false)
      }
    }

    initializeJob()
  }, []) // Empty dependency array ensures this only runs once

  // Handle when files are ready for configuration
  const handleFilesReady = (files: UploadedFile[]) => {
    if (!jobId) {
      toast({
        title: "Error",
        description: "No job ID available",
        variant: "destructive"
      })
      return
    }

    onFilesUploaded(jobId, files)
  }

  // Show loading while initializing
  if (!jobId) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Initializing upload...</p>
        </div>
      </div>
    )
  }

  return (
    <EnhancedFileUpload
      jobId={jobId}
      onFilesReady={handleFilesReady}
    />
  )
}
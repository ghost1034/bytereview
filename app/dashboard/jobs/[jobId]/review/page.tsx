'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import ReviewAndStartStep from '@/components/workflow/steps/ReviewAndStartStep'
import { useToast } from '@/hooks/use-toast'

async function getAuthToken(user: any): Promise<string> {
  if (!user) throw new Error('User not authenticated')
  return await user.getIdToken()
}

export default function JobReviewPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const jobId = params.jobId as string

  // Fetch job data
  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const token = await getAuthToken(user)
      const response = await fetch(`/api/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to load job')
      return response.json()
    },
    enabled: !!user && !!jobId,
    staleTime: 5 * 60 * 1000,
  })

  // Fetch job files
  const { data: filesData } = useQuery({
    queryKey: ['job-files', jobId],
    queryFn: async () => {
      const token = await getAuthToken(user)
      const response = await fetch(`/api/jobs/${jobId}/files?processable=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) throw new Error('Failed to load files')
      return response.json()
    },
    enabled: !!user && !!jobId,
    staleTime: 5 * 60 * 1000, // 5 minutes - invalidated when files are added/removed
  })

  // Submit job mutation
  const submitJobMutation = useMutation({
    mutationFn: async (jobName?: string) => {
      const token = await getAuthToken(user)
      
      // Update job name if provided
      if (jobName && jobName !== job?.name) {
        await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ name: jobName })
        })
      }
      
      // Submit job for processing
      console.log('Submitting job for processing:', jobId)
      const response = await fetch(`/api/jobs/${jobId}/submit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to submit job: ${errorText}`)
      }
      
      console.log('Job submitted successfully:', jobId)
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['jobs', 'resumable'] })
    }
  })

  const handleJobStarted = async (jobName?: string, templateId?: string) => {
    try {
      await submitJobMutation.mutateAsync(jobName)
      
      toast({
        title: "Job submitted",
        description: "Your job has been submitted for processing!"
      })
      
      // Navigate to processing page
      router.push(`/dashboard/jobs/${jobId}/processing`);
    } catch (error) {
      // Extract the actual error message from the error object
      let errorMessage = "Failed to submit job for processing"
      
      if (error instanceof Error) {
        // The error message from the mutation includes "Failed to submit job: " prefix
        // Extract just the actual API error message
        const fullMessage = error.message
        if (fullMessage.startsWith("Failed to submit job: ")) {
          const apiErrorText = fullMessage.substring("Failed to submit job: ".length)
          try {
            // Try to parse as JSON in case it's a structured error response
            const errorData = JSON.parse(apiErrorText)
            errorMessage = errorData.detail || errorData.message || apiErrorText
          } catch {
            // If not JSON, use the raw error text
            errorMessage = apiErrorText
          }
        } else {
          errorMessage = fullMessage
        }
      }
      
      toast({
        title: "Error submitting job",
        description: errorMessage,
        variant: "destructive"
      })
    }
  }

  const handleBack = () => {
    router.push(`/dashboard/jobs/${jobId}/fields`)
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
    size_bytes: file.file_size_bytes || 0,
    status: file.status
  })) || []

  // Create workflow state for ReviewAndStartStep
  const workflowState = {
    currentStep: 'review' as const,
    jobId: jobId,
    files: files,
    fields: job?.job_fields || [],
    taskDefinitions: job?.extraction_tasks || [],
    jobName: job?.name,
    templateId: job?.template_id,
    persistData: true
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Review & Start</h1>
        <p className="text-muted-foreground">
          Review your settings and start the extraction process
        </p>
      </div>

      {/* Progress indicator */}
      <div className="text-center text-sm text-muted-foreground">
        Step 3 of 3
      </div>

      {/* Review Step */}
      <Card>
        <CardHeader>
          <CardTitle>Review Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <ReviewAndStartStep
            workflowState={workflowState}
            onJobStarted={handleJobStarted}
            onBack={handleBack}
            isLoading={submitJobMutation.isPending}
          />
        </CardContent>
      </Card>

    </div>
  )
}
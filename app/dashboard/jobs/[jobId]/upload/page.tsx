'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import FileUploadStep from '@/components/workflow/steps/FileUploadStep'
import { UploadedFile } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

async function getAuthToken(user: any): Promise<string> {
  if (!user) throw new Error('User not authenticated')
  return await user.getIdToken()
}

export default function JobUploadPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const handleFilesUploaded = async (jobId: string, files: UploadedFile[]) => {
    try {
      // Update config step to fields
      const token = await getAuthToken(user)
      await fetch(`/api/jobs/${jobId}/config-step`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ config_step: 'fields' })
      })
      
      toast({
        title: "Files uploaded successfully",
        description: `${files.length} files ready for analysis`
      })
      
      // Navigate to next step
      router.push(`/dashboard/jobs/${jobId}/fields`)
    } catch (error) {
      console.error('Error updating config step:', error)
      // Still navigate even if step update fails
      toast({
        title: "Files uploaded successfully",
        description: `${files.length} files ready for analysis`
      })
      router.push(`/dashboard/jobs/${jobId}/fields`)
    }
  }

  const handleContinue = () => {
    // Check if files are uploaded
    if (job?.source_files?.length > 0) {
      router.push(`/dashboard/jobs/${jobId}/fields`)
    } else {
      toast({
        title: "No files uploaded",
        description: "Please upload files before continuing",
        variant: "destructive"
      })
    }
  }

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading...</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Upload Files</h1>
        <p className="text-muted-foreground">
          Select and upload your documents for data extraction
        </p>
      </div>

      {/* Progress indicator */}
      <div className="text-center text-sm text-muted-foreground">
        Step 1 of 3
      </div>

      {/* Upload Step */}
      <Card>
        <CardHeader>
          <CardTitle>Document Upload</CardTitle>
        </CardHeader>
        <CardContent>
          <FileUploadStep
            jobId={jobId}
            onFilesUploaded={handleFilesUploaded}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={() => router.push('/dashboard/jobs')}
        >
          Back to Jobs
        </Button>
        
        {job?.source_files?.length > 0 && (
          <Button onClick={handleContinue}>
            Continue to Configuration
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  )
}
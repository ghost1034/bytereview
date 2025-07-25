'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import FieldConfigurationStep from '@/components/workflow/steps/FieldConfigurationStep'
import { JobFieldConfig, TaskDefinition } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

async function getAuthToken(user: any): Promise<string> {
  if (!user) throw new Error('User not authenticated')
  return await user.getIdToken()
}

export default function JobFieldsPage() {
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
    staleTime: 10 * 60 * 1000, // Files change less frequently
  })

  // Save field configuration mutation
  const saveFieldsMutation = useMutation({
    mutationFn: async ({ fields, templateId, processingModes }: { 
      fields: JobFieldConfig[], 
      templateId?: string,
      processingModes?: Record<string, string>
    }) => {
      const token = await getAuthToken(user)
      const response = await fetch(`/api/jobs/${jobId}/fields`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          fields, 
          template_id: templateId,
          processing_modes: processingModes
        })
      })
      if (!response.ok) throw new Error('Failed to save configuration')
      return response.json()
    },
    onSuccess: () => {
      // Invalidate job data to refresh
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    }
  })

  const handleFieldsConfigured = async (fields: JobFieldConfig[], taskDefinitions: TaskDefinition[], templateId?: string) => {
    try {
      // Debug: Log what we received
      console.log('handleFieldsConfigured called with:');
      console.log('fields:', fields);
      console.log('taskDefinitions:', taskDefinitions);
      console.log('templateId:', templateId);
      
      // Extract processing modes from task definitions
      const processingModes: Record<string, string> = {}
      taskDefinitions.forEach(task => {
        console.log('Processing task:', task);
        if (task.path && task.mode) {
          processingModes[task.path] = task.mode
          console.log(`Added processing mode: ${task.path} -> ${task.mode}`);
        }
      })
      
      console.log('Final processingModes:', processingModes);
      
      // Save field configuration and processing modes
      await saveFieldsMutation.mutateAsync({ 
        fields, 
        templateId,
        processingModes
      })
      
      // Update config step to review
      const token = await getAuthToken(user)
      await fetch(`/api/jobs/${jobId}/config-step`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ config_step: 'review' })
      })
      
      toast({
        title: "Configuration saved",
        description: "Field configuration and processing modes have been saved successfully"
      })
      
      // Navigate to next step
      router.push(`/dashboard/jobs/${jobId}/review`)
    } catch (error) {
      toast({
        title: "Error saving configuration",
        description: "Failed to save configuration",
        variant: "destructive"
      })
    }
  }

  const handleBack = () => {
    router.push(`/dashboard/jobs/${jobId}/upload`)
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
            onFieldsConfigured={handleFieldsConfigured}
            onBack={handleBack}
          />
        </CardContent>
      </Card>

    </div>
  )
}
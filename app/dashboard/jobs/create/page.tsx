'use client'

import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useEffect } from 'react'

async function getAuthToken(user: any): Promise<string> {
  if (!user) throw new Error('User not authenticated')
  return await user.getIdToken()
}

export default function CreateJobPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()

  // Create job mutation
  const createJobMutation = useMutation({
    mutationFn: async () => {
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
      
      return response.json()
    },
    onSuccess: (jobData) => {
      toast({
        title: "Job created",
        description: "Your new extraction job has been created successfully"
      })
      
      // Navigate to upload step
      router.push(`/dashboard/jobs/${jobData.id}/upload`)
    },
    onError: (error) => {
      toast({
        title: "Error creating job",
        description: "Failed to create new job. Please try again.",
        variant: "destructive"
      })
    }
  })

  // Auto-create job when page loads
  useEffect(() => {
    if (user && !createJobMutation.isPending && !createJobMutation.isSuccess) {
      createJobMutation.mutate()
    }
  }, [user, createJobMutation])

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Create New Job</h1>
        <p className="text-muted-foreground">
          Setting up your document extraction job
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>Creating Job</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            {createJobMutation.isPending ? (
              <div className="text-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-muted-foreground">Creating your job...</p>
              </div>
            ) : createJobMutation.isError ? (
              <div className="text-center space-y-4">
                <div className="text-red-600 text-lg">❌</div>
                <p className="text-muted-foreground">Failed to create job</p>
                <Button onClick={() => createJobMutation.mutate()}>
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="text-green-600 text-lg">✅</div>
                <p className="text-muted-foreground">Job created successfully!</p>
                <p className="text-sm text-muted-foreground">Redirecting to upload...</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={() => router.push('/dashboard/jobs')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Jobs
        </Button>
      </div>
    </div>
  )
}
'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import ResultsStep from '@/components/workflow/steps/ResultsStep'

async function getAuthToken(user: any): Promise<string> {
  if (!user) throw new Error('User not authenticated')
  return await user.getIdToken()
}

export default function JobResultsPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
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

  const handleStartNew = () => {
    router.push('/dashboard/jobs/create')
  }

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading...</div>
  }


  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Results</h1>
        <p className="text-muted-foreground">
          View and export your extracted data
        </p>
      </div>

      {/* Results Step */}
      <Card>
        <CardHeader>
          <CardTitle>Extraction Results</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultsStep
            jobId={jobId}
            onStartNew={handleStartNew}
          />
        </CardContent>
      </Card>

    </div>
  )
}
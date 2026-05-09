'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { JobWorkflowFrame, WorkflowFooter } from '@/components/workflow/JobWorkflowFrame'
import { Section } from '@/components/ui/section'
import { LoadingState } from '@/components/ui/loading-state'
import ProcessingStep from '@/components/workflow/steps/ProcessingStep'
import { apiClient } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export default function JobProcessingPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const jobId = params.jobId as string

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => apiClient.getJobDetails(jobId),
    enabled: !!user && !!jobId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data as any
      if (data?.status === 'in_progress') return false
      return 30 * 1000
    },
  }) as any

  const handleJobCompleted = (id: string) => {
    toast({
      title: 'Processing completed',
      description: 'Your data extraction has finished successfully.',
    })
    router.push(`/dashboard/jobs/${id}/results`)
  }

  const handleViewResults = () => {
    router.push(`/dashboard/jobs/${jobId}/results`)
  }

  const handleBack = () => {
    if (job?.config_step !== 'submitted' || job?.status === 'failed') {
      router.push(`/dashboard/jobs/${jobId}/review`)
    } else {
      toast({
        title: 'Cannot go back',
        description: 'Job is currently processing and cannot be modified.',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return <LoadingState variant="page" />
  }

  if (job?.status === 'completed') {
    router.push(`/dashboard/jobs/${jobId}/results`)
    return (
      <div className="flex justify-center p-8 text-foreground-muted">
        Redirecting to results…
      </div>
    )
  }

  const canGoBack = job?.config_step !== 'submitted' || job?.status === 'failed'

  return (
    <JobWorkflowFrame
      step="processing"
      jobName={job?.name || 'Job'}
      description="The AI is extracting data from your documents. You can leave this page — we’ll keep working in the background."
      footer={
        <WorkflowFooter
          back={
            canGoBack ? (
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-1.5 size-4" aria-hidden />
                Back to review
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => router.push('/dashboard/jobs')}
              >
                Back to jobs
              </Button>
            )
          }
          primary={
            job?.status === 'completed' ? (
              <Button onClick={handleViewResults}>View results</Button>
            ) : null
          }
        />
      }
    >
      <Section variant="card" title="Data extraction" description="Live status">
        <ProcessingStep
          jobId={jobId}
          onJobCompleted={handleJobCompleted}
          onViewResults={handleViewResults}
          onBack={handleBack}
        />
      </Section>
    </JobWorkflowFrame>
  )
}

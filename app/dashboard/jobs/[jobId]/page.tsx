import JobWorkflow from '@/components/workflow/JobWorkflow'

interface JobWorkflowPageProps {
  params: {
    jobId: string
  }
}

export default function JobWorkflowPage({ params }: JobWorkflowPageProps) {
  return <JobWorkflow jobId={params.jobId} />
}
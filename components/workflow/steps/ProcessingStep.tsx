/**
 * Processing Step for Job Workflow
 * Real-time progress tracking and status updates
 */
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowLeft, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock,
  FileText,
  Brain,
  Database,
  AlertTriangle
} from 'lucide-react'
import { useJobDetails, useJobProgress } from '@/hooks/useJobs'
import { JobStatus } from '@/lib/job-types'

interface ProcessingStepProps {
  jobId: string
  onJobCompleted: (jobId: string) => void
  onBack: () => void
}

export default function ProcessingStep({ jobId, onJobCompleted, onBack }: ProcessingStepProps) {
  const { data: jobDetails, isLoading: jobLoading } = useJobDetails(jobId)
  const { data: progress, isLoading: progressLoading } = useJobProgress(jobId)
  const [startTime] = useState(Date.now())
  const [elapsedTime, setElapsedTime] = useState(0)

  // Update elapsed time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  // Check if job is completed
  useEffect(() => {
    if (jobDetails?.status === 'completed') {
      onJobCompleted(jobId)
    }
  }, [jobDetails?.status, jobId, onJobCompleted])

  const formatElapsedTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${remainingSeconds}s`
  }

  const getStatusIcon = (status: JobStatus) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-gray-500" />
      default:
        return <Clock className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case 'processing':
        return 'bg-blue-500'
      case 'completed':
        return 'bg-green-500'
      case 'failed':
        return 'bg-red-500'
      case 'cancelled':
        return 'bg-gray-500'
      default:
        return 'bg-gray-400'
    }
  }

  const calculateProgress = () => {
    if (!progress) return 0
    if (progress.total_tasks === 0) return 0
    return Math.round((progress.completed / progress.total_tasks) * 100)
  }

  const progressPercentage = calculateProgress()
  const isProcessing = jobDetails?.status === 'processing'
  const isCompleted = jobDetails?.status === 'completed'
  const isFailed = jobDetails?.status === 'failed'

  if (jobLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading job details...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Job Status Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(jobDetails?.status || 'processing')}
              <div>
                <h2 className="text-xl font-semibold">
                  {jobDetails?.name || 'Extraction Job'}
                </h2>
                <p className="text-muted-foreground">
                  Status: {jobDetails?.status?.replace('_', ' ').toUpperCase()}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Elapsed Time</div>
              <div className="text-lg font-mono">{formatElapsedTime(elapsedTime)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Processing Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Overall Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Progress</span>
                <span>{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>

            {/* Task Statistics */}
            {progress && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-blue-600">
                    {progress.total_tasks}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Tasks</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-green-600">
                    {progress.completed}
                  </div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-orange-600">
                    {progress.total_tasks - progress.completed - progress.failed}
                  </div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-red-600">
                    {progress.failed}
                  </div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Processing Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Step 1: File Processing */}
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                progressPercentage > 0 ? 'bg-green-500' : 'bg-gray-300'
              }`}>
                {progressPercentage > 0 ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <FileText className="w-5 h-5 text-gray-600" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">File Download & Preparation</div>
                <div className="text-sm text-muted-foreground">
                  Downloading files from cloud storage
                </div>
              </div>
              <Badge variant={progressPercentage > 0 ? "default" : "secondary"}>
                {progressPercentage > 0 ? "Complete" : "Pending"}
              </Badge>
            </div>

            {/* Step 2: AI Processing */}
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isProcessing ? 'bg-blue-500' : progressPercentage === 100 ? 'bg-green-500' : 'bg-gray-300'
              }`}>
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : progressPercentage === 100 ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <Brain className="w-5 h-5 text-gray-600" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">AI Data Extraction</div>
                <div className="text-sm text-muted-foreground">
                  Extracting structured data using AI
                </div>
              </div>
              <Badge variant={
                isProcessing ? "default" : 
                progressPercentage === 100 ? "default" : "secondary"
              }>
                {isProcessing ? "Processing" : 
                 progressPercentage === 100 ? "Complete" : "Pending"}
              </Badge>
            </div>

            {/* Step 3: Data Storage */}
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isCompleted ? 'bg-green-500' : 'bg-gray-300'
              }`}>
                {isCompleted ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <Database className="w-5 h-5 text-gray-600" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium">Results Storage</div>
                <div className="text-sm text-muted-foreground">
                  Saving extracted data to database
                </div>
              </div>
              <Badge variant={isCompleted ? "default" : "secondary"}>
                {isCompleted ? "Complete" : "Pending"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {isFailed && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5" />
              <div>
                <strong>Processing Failed</strong>
                <p className="text-sm mt-1">
                  The extraction job encountered an error. Please try again or contact support if the issue persists.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Updates Notice */}
      {isProcessing && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-800">
              <Loader2 className="w-5 h-5 animate-spin" />
              <div>
                <strong>Processing in Progress</strong>
                <p className="text-sm mt-1">
                  This page updates automatically. You can safely navigate away and return later.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={onBack}
          disabled={isProcessing}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        {isCompleted && (
          <Button onClick={() => onJobCompleted(jobId)}>
            View Results
          </Button>
        )}
      </div>
    </div>
  )
}
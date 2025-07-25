/**
 * Multi-step job workflow component for ByteReview
 * Replaces the single-page dashboard with a guided workflow
 */
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  CheckCircle, 
  Circle, 
  Upload, 
  Settings, 
  Play, 
  BarChart3,
  ArrowRight,
  ArrowLeft,
  Loader2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useJobWorkflow } from '@/hooks/useJobWorkflow'
import { useSearchParams, useRouter } from 'next/navigation'
import { JobWorkflowState, WorkflowStep, UploadedFile, JobFieldConfig, TaskDefinition } from '@/lib/api'

// Import step components
import FileUploadStep from './steps/FileUploadStep'
import FieldConfigurationStep from './steps/FieldConfigurationStep'
import ReviewAndStartStep from './steps/ReviewAndStartStep'
import ProcessingStep from './steps/ProcessingStep'
import ResultsStep from './steps/ResultsStep'

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'upload',
    title: 'Upload Files',
    description: 'Select and upload your documents',
    completed: false,
    current: true
  },
  {
    id: 'configure',
    title: 'Configure Fields',
    description: 'Define what data to extract',
    completed: false,
    current: false
  },
  {
    id: 'review',
    title: 'Review & Start',
    description: 'Review settings and start processing',
    completed: false,
    current: false
  },
  {
    id: 'processing',
    title: 'Processing',
    description: 'AI is extracting your data',
    completed: false,
    current: false
  },
  {
    id: 'results',
    title: 'Results',
    description: 'View and export your data',
    completed: false,
    current: false
  }
]

interface JobWorkflowProps {
  jobId?: string // Optional existing job ID
  onJobComplete?: (jobId: string) => void
}

export default function JobWorkflow({ jobId: providedJobId, onJobComplete }: JobWorkflowProps) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Get job ID from URL params or props
  const jobId = searchParams.get('jobId') || providedJobId
  
  // Get the step parameter from URL for resuming
  const stepParam = searchParams.get('step')
  
  // Use the enhanced resumable workflow hook
  const {
    job,
    workflowState: resumableState,
    isLoading,
    autoSaving,
    updateStep,
    updateWorkflowData,
    submitForProcessing,
    getProgressInfo,
    isSubmitting,
    isUpdatingStep
  } = useJobWorkflow(jobId, stepParam)
  
  // Map resumable workflow step to component step index
  const getStepIndex = (step: string) => {
    const stepMap = { upload: 0, fields: 1, review: 2, submitted: 3 }
    return stepMap[step as keyof typeof stepMap] || 0
  }

  // Use resumable state as the ONLY source of truth - no local state conflicts
  const currentStep = resumableState ? getStepIndex(resumableState.currentStep) : 0
  const workflowData = {
    currentStep: resumableState?.currentStep || 'upload',
    jobId: jobId,
    files: resumableState?.uploadedFiles || [],
    fields: resumableState?.fields || [],
    taskDefinitions: resumableState?.taskDefinitions || [],
    jobName: resumableState?.jobName,
    templateId: resumableState?.templateId,
    persistData: true
  }

  const [steps, setSteps] = useState(WORKFLOW_STEPS)

  // Update step completion status when resumable state changes
  useEffect(() => {
    if (resumableState) {
      updateStepState(getStepIndex(resumableState.currentStep), false, true)
    }
  }, [resumableState])

  // Update step states
  const updateStepState = (stepIndex: number, completed: boolean, current: boolean = false) => {
    setSteps(prev => prev.map((step, index) => ({
      ...step,
      completed: index < stepIndex ? true : (index === stepIndex ? completed : false),
      current: index === stepIndex && current
    })))
  }

  // Navigation functions - now only update backend, let resumable state drive UI
  const nextStep = async () => {
    if (currentStep < steps.length - 1) {
      updateStepState(currentStep, true)
      
      // Update backend step - this will trigger resumable state update
      const nextStepName = ['upload', 'fields', 'review'][currentStep + 1] as 'upload' | 'fields' | 'review'
      await updateStep(nextStepName)
    }
  }

  const prevStep = async () => {
    if (currentStep > 0) {
      // Update backend step - this will trigger resumable state update
      const prevStepName = ['upload', 'fields', 'review'][currentStep - 1] as 'upload' | 'fields' | 'review'
      await updateStep(prevStepName)
    }
  }

  // Step completion handlers - simplified to only update backend
  const handleFilesUploaded = (jobId: string, files: UploadedFile[]) => {
    // Update resumable workflow state
    updateWorkflowData({ uploadedFiles: files })
    
    toast({
      title: "Files uploaded successfully",
      description: `${files.length} files ready for analysis`
    })
    
    nextStep()
  }

  const handleFieldsConfigured = async (fields: JobFieldConfig[], taskDefinitions: TaskDefinition[], templateId?: string) => {
    // Save the field configuration data and wait for it to complete
    await updateWorkflowData({ 
      fields, 
      taskDefinitions, 
      templateId 
    })
    
    // Only advance step after data is saved
    await nextStep()
  }

  const handleJobStarted = (jobName?: string, templateId?: string) => {
    // Update backend with job name if provided
    if (jobName) {
      updateWorkflowData({ jobName })
    }
    
    nextStep()
  }

  const handleJobCompleted = (jobId: string) => {
    // Mark the processing step (index 3) as completed
    updateStepState(3, true)
    onJobComplete?.(jobId)
  }

  // Calculate progress
  const progress = ((currentStep + 1) / steps.length) * 100

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <FileUploadStep
            jobId={workflowData.jobId}
            onFilesUploaded={handleFilesUploaded}
            isLoading={isLoading}
          />
        )
      
      case 1:
        return (
          <FieldConfigurationStep
            files={workflowData.files}
            initialFields={workflowData.fields}
            initialTaskDefinitions={workflowData.taskDefinitions}
            onFieldsConfigured={handleFieldsConfigured}
            onBack={async () => await prevStep()}
          />
        )
      
      case 2:
        return (
          <ReviewAndStartStep
            workflowState={workflowData}
            onJobStarted={handleJobStarted}
            onBack={async () => await prevStep()}
            isLoading={isLoading}
          />
        )
      
      case 3:
        return (
          <ProcessingStep
            jobId={workflowState.jobId!}
            onJobCompleted={handleJobCompleted}
            onViewResults={() => {
              // Navigate to job results page
              router.push(`/dashboard/jobs/${workflowData.jobId}`)
            }}
            onBack={async () => await prevStep()}
          />
        )
      
      case 4:
        return (
          <ResultsStep
            jobId={workflowData.jobId!}
            onStartNew={() => {
              // Navigate to new job creation
              router.push('/dashboard/jobs/create')
            }}
          />
        )
      
      default:
        return <div>Unknown step</div>
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-4">
          <h1 className="text-3xl font-bold">
            {job?.name || 'Document Data Extraction'}
          </h1>
          {autoSaving && (
            <div className="flex items-center text-sm text-gray-500">
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Saving...
            </div>
          )}
        </div>
        <p className="text-muted-foreground">
          {jobId ? 'Continue where you left off' : 'Extract structured data from your documents using AI'}
        </p>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Step {currentStep + 1} of {steps.length}</span>
              <span>{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Step Navigation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center space-y-2">
                  <div className={`
                    flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors
                    ${step.completed 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : step.current 
                        ? 'border-blue-500 text-blue-500' 
                        : 'border-gray-300 text-gray-400'
                    }
                  `}>
                    {step.completed ? (
                      <CheckCircle className="w-6 h-6" />
                    ) : (
                      <Circle className="w-6 h-6" />
                    )}
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-medium ${
                      step.current ? 'text-blue-600' : step.completed ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-muted-foreground max-w-24">
                      {step.description}
                    </div>
                  </div>
                </div>
                
                {index < steps.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-gray-400 mx-4" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>Extraction Job</CardTitle>
        </CardHeader>
        <CardContent>
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Error Display */}
    </div>
  )
}
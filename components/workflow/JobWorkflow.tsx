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
import { useJobWorkflow } from '@/hooks/useJobs'
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
  const jobWorkflow = useJobWorkflow()
  
  // Workflow state
  const [currentStep, setCurrentStep] = useState(0)
  const [steps, setSteps] = useState(WORKFLOW_STEPS)
  const [workflowState, setWorkflowState] = useState<JobWorkflowState>({
    currentStep: 0,
    jobId: providedJobId, // Use provided job ID if available
    files: [],
    fields: [],
    taskDefinitions: [],
    persistData: true
  })

  // Update step states
  const updateStepState = (stepIndex: number, completed: boolean, current: boolean = false) => {
    setSteps(prev => prev.map((step, index) => ({
      ...step,
      completed: index < stepIndex ? true : (index === stepIndex ? completed : false),
      current: index === stepIndex && current
    })))
  }

  // Navigation functions
  const goToStep = (stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < steps.length) {
      setCurrentStep(stepIndex)
      setWorkflowState(prev => ({ ...prev, currentStep: stepIndex }))
      updateStepState(stepIndex, false, true)
    }
  }

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      updateStepState(currentStep, true)
      goToStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1)
    }
  }

  // Step completion handlers
  const handleFilesUploaded = (jobId: string, files: UploadedFile[]) => {
    setWorkflowState(prev => ({
      ...prev,
      jobId,
      files
    }))
    
    toast({
      title: "Files uploaded successfully",
      description: `${files.length} files ready for analysis`
    })
    
    nextStep()
  }

  const handleFieldsConfigured = (fields: JobFieldConfig[], taskDefinitions: TaskDefinition[]) => {
    setWorkflowState(prev => ({
      ...prev,
      fields,
      taskDefinitions
    }))
    
    nextStep()
  }

  const handleJobStarted = (jobName?: string, templateId?: string) => {
    setWorkflowState(prev => ({
      ...prev,
      jobName,
      templateId
    }))
    
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
            jobId={workflowState.jobId}
            onFilesUploaded={handleFilesUploaded}
            isLoading={jobWorkflow.isLoading}
          />
        )
      
      case 1:
        return (
          <FieldConfigurationStep
            files={workflowState.files}
            initialFields={workflowState.fields}
            initialTaskDefinitions={workflowState.taskDefinitions}
            onFieldsConfigured={handleFieldsConfigured}
            onBack={prevStep}
          />
        )
      
      case 2:
        return (
          <ReviewAndStartStep
            workflowState={workflowState}
            onJobStarted={handleJobStarted}
            onBack={prevStep}
            isLoading={jobWorkflow.isLoading}
          />
        )
      
      case 3:
        return (
          <ProcessingStep
            jobId={workflowState.jobId!}
            onJobCompleted={handleJobCompleted}
            onViewResults={() => goToStep(4)}
            onBack={prevStep}
          />
        )
      
      case 4:
        return (
          <ResultsStep
            jobId={workflowState.jobId!}
            onStartNew={() => {
              // Reset workflow
              setCurrentStep(0)
              setWorkflowState({
                currentStep: 0,
                files: [],
                fields: [],
                taskDefinitions: [],
                persistData: true
              })
              setSteps(WORKFLOW_STEPS)
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
        <h1 className="text-3xl font-bold">Document Data Extraction</h1>
        <p className="text-muted-foreground">
          Extract structured data from your documents using AI
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
      {jobWorkflow.error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-red-800">
              <strong>Error:</strong> {jobWorkflow.error.message}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
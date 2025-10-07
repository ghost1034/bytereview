/**
 * Review and Start Step for Job Workflow
 * Final review before starting the extraction job
 */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  ArrowLeft, 
  Play, 
  FileText, 
  Settings, 
  Clock,
  Database,
  Loader2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { JobWorkflowState } from '@/lib/api'

interface ReviewAndStartStepProps {
  workflowState: JobWorkflowState
  onJobStarted: (jobName?: string, templateId?: string) => void
  onBack: () => void
  isLoading?: boolean
  readOnly?: boolean
}

export default function ReviewAndStartStep({ 
  workflowState, 
  onJobStarted, 
  onBack, 
  isLoading,
  readOnly = false
}: ReviewAndStartStepProps) {
  const { toast } = useToast()
  
  const [persistData, setPersistData] = useState(true)
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const handleStartJob = async () => {
    if (!workflowState.jobId) {
      toast({
        title: "Error",
        description: "No job ID found. Please go back and upload files again.",
        variant: "destructive"
      })
      return
    }

    // Just call the parent handler - the review page will handle the actual submission
    onJobStarted(undefined, workflowState.templateId)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const totalFileSize = workflowState.files.reduce((sum, file) => sum + (file.size_bytes || 0), 0)
  const estimatedTime = Math.max(1, Math.ceil(workflowState.files.length * 0.5)) // Rough estimate

  return (
    <div className="space-y-6">
      {/* Job Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Job Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="persist-data"
              checked={persistData}
              onCheckedChange={readOnly ? undefined : (checked) => setPersistData(checked as boolean)}
              disabled={readOnly}
            />
            <Label htmlFor="persist-data" className="text-sm">
              Keep source files for future reference
            </Label>
          </div>

          {!persistData && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> If you choose not to keep source files, your files will be automatically discarded upon expiry.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Files to Process
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {workflowState.files.length}
                </div>
                <div className="text-sm text-muted-foreground">Files</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {formatFileSize(totalFileSize)}
                </div>
                <div className="text-sm text-muted-foreground">Total Size</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {workflowState.fields.length}
                </div>
                <div className="text-sm text-muted-foreground">Fields</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  ~{estimatedTime}
                </div>
                <div className="text-sm text-muted-foreground">Min Est.</div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium">File List:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {workflowState.files.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{file.original_filename}</span>
                    <Badge variant="outline" className="text-xs">
                      {formatFileSize(file.size_bytes || 0)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Configuration Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Field Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {workflowState.fields.map((field, index) => (
              <div key={index} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{field.field_name}</span>
                  <Badge variant="secondary">{field.data_type_id}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {field.ai_prompt}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Processing Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Processing Mode per Folder */}
            <div>
              <h4 className="font-medium mb-2">Processing Mode by Folder:</h4>
              <div className="space-y-2">
                {workflowState.taskDefinitions.map((task, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm">
                      {task.path === '/' ? 'Root Folder' : task.path} ({task.file_count || 0} files)
                    </span>
                    <Badge variant="secondary">
                      {task.mode === 'individual' ? 'Individual' : 'Combined'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-between">
              <span>Data Persistence:</span>
              <Badge variant={persistData ? "default" : "secondary"}>
                {persistData ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estimated Processing Time */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium text-blue-900">
                Estimated Processing Time: {estimatedTime} minutes
              </p>
              <p className="text-sm text-blue-700">
                You'll be able to monitor progress in real-time on the next step
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        <Button 
          onClick={handleStartJob} 
          disabled={isLoading || readOnly}
          size="lg"
        >
          {readOnly ? (
            <>
              <Play className="w-4 h-4 mr-2" />
              View Only
            </>
          ) : isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Starting Job...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Processing
            </>
          )}
        </Button>
      </div>

    </div>
  )
}
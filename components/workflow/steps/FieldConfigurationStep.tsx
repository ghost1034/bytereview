/**
 * Field Configuration Step for Job Workflow
 * Allows users to define what data to extract from documents
 */
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Plus, 
  Trash2, 
  ArrowLeft, 
  ArrowRight,
  Settings,
  FileText,
  GripVertical,
  Copy
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useTemplates } from '@/hooks/useExtraction'
import { UploadedFile, JobFieldConfig, TaskDefinition, ProcessingMode } from '@/lib/job-types'

// Data types available for field configuration
const DATA_TYPES = [
  { id: 'text', name: 'Text', description: 'General text field' },
  { id: 'email', name: 'Email', description: 'Email address' },
  { id: 'phone', name: 'Phone Number', description: 'Phone number' },
  { id: 'currency', name: 'Currency', description: 'Monetary amount' },
  { id: 'number', name: 'Number', description: 'Numeric value' },
  { id: 'date_ymd', name: 'Date (YYYY-MM-DD)', description: 'Date format' },
  { id: 'boolean', name: 'Boolean (Yes/No)', description: 'True/false value' }
]

interface FieldConfigurationStepProps {
  files: UploadedFile[]
  onFieldsConfigured: (fields: JobFieldConfig[], taskDefinitions: TaskDefinition[]) => void
  onBack: () => void
}

export default function FieldConfigurationStep({ 
  files, 
  onFieldsConfigured, 
  onBack 
}: FieldConfigurationStepProps) {
  const { toast } = useToast()
  const { data: templates } = useTemplates()
  
  const [fields, setFields] = useState<JobFieldConfig[]>([
    {
      field_name: '',
      data_type_id: 'text',
      ai_prompt: '',
      display_order: 0
    }
  ])
  
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('individual')

  // Load template when selected
  useEffect(() => {
    if (selectedTemplate && templates?.templates) {
      const template = templates.templates.find(t => t.id === selectedTemplate)
      if (template) {
        const templateFields: JobFieldConfig[] = template.fields.map((field, index) => ({
          field_name: field.name,
          data_type_id: field.data_type,
          ai_prompt: field.prompt,
          display_order: index
        }))
        setFields(templateFields)
        
        toast({
          title: "Template loaded",
          description: `Loaded ${templateFields.length} fields from "${template.name}"`
        })
      }
    }
  }, [selectedTemplate, templates, toast])

  // Group files by folder for task definition
  const getFileFolders = () => {
    const folders = new Set<string>()
    files.forEach(file => {
      const folder = file.path.includes('/') 
        ? file.path.substring(0, file.path.lastIndexOf('/'))
        : '/'
      folders.add(folder)
    })
    return Array.from(folders).sort()
  }

  const addField = () => {
    setFields(prev => [
      ...prev,
      {
        field_name: '',
        data_type_id: 'text',
        ai_prompt: '',
        display_order: prev.length
      }
    ])
  }

  const removeField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index))
  }

  const updateField = (index: number, updates: Partial<JobFieldConfig>) => {
    setFields(prev => prev.map((field, i) => 
      i === index ? { ...field, ...updates } : field
    ))
  }

  const duplicateField = (index: number) => {
    const fieldToDuplicate = fields[index]
    setFields(prev => [
      ...prev,
      {
        ...fieldToDuplicate,
        field_name: `${fieldToDuplicate.field_name} (Copy)`,
        display_order: prev.length
      }
    ])
  }

  const validateFields = () => {
    const errors: string[] = []
    
    if (fields.length === 0) {
      errors.push("At least one field is required")
    }
    
    fields.forEach((field, index) => {
      if (!field.field_name.trim()) {
        errors.push(`Field ${index + 1}: Name is required`)
      }
      if (!field.ai_prompt.trim()) {
        errors.push(`Field ${index + 1}: Prompt is required`)
      }
    })
    
    // Check for duplicate field names
    const fieldNames = fields.map(f => f.field_name.trim().toLowerCase())
    const duplicates = fieldNames.filter((name, index) => 
      name && fieldNames.indexOf(name) !== index
    )
    
    if (duplicates.length > 0) {
      errors.push("Duplicate field names are not allowed")
    }
    
    return errors
  }

  const handleContinue = () => {
    const errors = validateFields()
    
    if (errors.length > 0) {
      toast({
        title: "Validation Error",
        description: errors.join(', '),
        variant: "destructive"
      })
      return
    }

    // Create task definitions based on processing mode and file structure
    const folders = getFileFolders()
    const taskDefinitions: TaskDefinition[] = folders.map(folder => ({
      path: folder,
      mode: processingMode
    }))

    // Update display order
    const orderedFields = fields.map((field, index) => ({
      ...field,
      display_order: index
    }))

    onFieldsConfigured(orderedFields, taskDefinitions)
  }

  return (
    <div className="space-y-6">
      {/* File Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Files to Process ({files.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {files.slice(0, 6).map((file, index) => (
              <Badge key={index} variant="secondary" className="justify-start">
                {file.file.name}
              </Badge>
            ))}
            {files.length > 6 && (
              <Badge variant="outline">
                +{files.length - 6} more files
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Template Selection */}
      {templates?.templates && templates.templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Load from Template (Optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a saved template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.templates.map(template => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name} ({template.fields.length} fields)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Processing Mode */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={processingMode} onValueChange={(value: ProcessingMode) => setProcessingMode(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">
                Individual - Process each file separately
              </SelectItem>
              <SelectItem value="combined">
                Combined - Process all files together
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-2">
            {processingMode === 'individual' 
              ? 'Each file will be processed separately, creating individual results.'
              : 'All files will be processed together, creating combined results.'
            }
          </p>
        </CardContent>
      </Card>

      {/* Field Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Field Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">Field {index + 1}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateField(index)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    {fields.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeField(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Field Name</Label>
                    <Input
                      placeholder="e.g., Invoice Number"
                      value={field.field_name}
                      onChange={(e) => updateField(index, { field_name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Data Type</Label>
                    <Select
                      value={field.data_type_id}
                      onValueChange={(value) => updateField(index, { data_type_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DATA_TYPES.map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>AI Prompt</Label>
                  <Textarea
                    placeholder="Describe what data to extract and how to find it..."
                    value={field.ai_prompt}
                    onChange={(e) => updateField(index, { ai_prompt: e.target.value })}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Be specific about what data to extract and where to find it in the document.
                  </p>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={addField}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Field
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        <Button onClick={handleContinue}>
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
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
import { UploadedFile, JobFieldConfig, TaskDefinition, ProcessingMode, DataType, apiClient } from '@/lib/api'

interface FieldConfigurationStepProps {
  files: UploadedFile[]
  initialFields?: JobFieldConfig[]
  initialTaskDefinitions?: TaskDefinition[]
  onFieldsConfigured: (fields: JobFieldConfig[], taskDefinitions: TaskDefinition[]) => void
  onBack: () => void
}

export default function FieldConfigurationStep({ 
  files, 
  initialFields,
  initialTaskDefinitions,
  onFieldsConfigured, 
  onBack 
}: FieldConfigurationStepProps) {
  const { toast } = useToast()
  const { data: templates } = useTemplates()
  const [dataTypes, setDataTypes] = useState<DataType[]>([])
  const [loadingDataTypes, setLoadingDataTypes] = useState(true)
  
  const [fields, setFields] = useState<JobFieldConfig[]>(
    initialFields && initialFields.length > 0 
      ? initialFields 
      : [{
          field_name: '',
          data_type_id: 'text',
          ai_prompt: '',
          display_order: 0
        }]
  )
  
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [folderProcessingModes, setFolderProcessingModes] = useState<Record<string, ProcessingMode>>({})

  // Load data types from API
  useEffect(() => {
    const loadDataTypes = async () => {
      try {
        const dataTypes = await apiClient.getDataTypes()
        setDataTypes(dataTypes)
      } catch (error) {
        console.error('Error loading data types:', error)
        toast({
          title: "Error loading data types",
          description: "Using default data types. Please check your connection.",
          variant: "destructive"
        })
        // Fallback to basic data types
        setDataTypes([
          { 
            id: 'text', 
            display_name: 'Text', 
            description: 'General text field',
            base_json_type: 'string',
            display_order: 1
          },
          { 
            id: 'number', 
            display_name: 'Number', 
            description: 'Numeric value',
            base_json_type: 'number',
            display_order: 2
          },
          { 
            id: 'currency', 
            display_name: 'Currency', 
            description: 'Monetary amount',
            base_json_type: 'number',
            display_order: 3
          },
          { 
            id: 'date_ymd', 
            display_name: 'Date (YYYY-MM-DD)', 
            description: 'Date format',
            base_json_type: 'string',
            json_format: 'date',
            display_order: 4
          },
          { 
            id: 'boolean', 
            display_name: 'Boolean (Yes/No)', 
            description: 'True/false value',
            base_json_type: 'boolean',
            display_order: 5
          }
        ])
      } finally {
        setLoadingDataTypes(false)
      }
    }

    loadDataTypes()
  }, [])

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
      const folder = file.original_path.includes('/') 
        ? file.original_path.substring(0, file.original_path.lastIndexOf('/'))
        : '/'
      folders.add(folder)
    })
    return Array.from(folders).sort()
  }

  // Initialize processing modes for all folders
  useEffect(() => {
    const folders = getFileFolders()
    
    // If we have initial task definitions, use those to set processing modes
    const initialModes: Record<string, ProcessingMode> = {}
    if (initialTaskDefinitions && initialTaskDefinitions.length > 0) {
      initialTaskDefinitions.forEach(task => {
        initialModes[task.path] = task.mode
      })
    }
    
    setFolderProcessingModes(prev => {
      const newModes = { ...prev, ...initialModes }
      folders.forEach(folder => {
        if (!(folder in newModes)) {
          newModes[folder] = 'individual' // Default to individual
        }
      })
      return newModes
    })
  }, [files, initialTaskDefinitions])

  // Get files for a specific folder
  const getFilesInFolder = (folder: string) => {
    return files.filter(file => {
      const fileFolder = file.original_path.includes('/') 
        ? file.original_path.substring(0, file.original_path.lastIndexOf('/'))
        : '/'
      return fileFolder === folder
    })
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
      mode: folderProcessingModes[folder] || 'individual'
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
                {file.original_filename}
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

      {/* Processing Mode per Folder */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Mode by Folder</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {getFileFolders().map(folder => {
              const folderFiles = getFilesInFolder(folder)
              return (
                <div key={folder} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium">{folder === '/' ? 'Root Folder' : folder}</h4>
                      <p className="text-sm text-muted-foreground">
                        {folderFiles.length} file{folderFiles.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Select 
                      value={folderProcessingModes[folder] || 'individual'} 
                      onValueChange={(value: ProcessingMode) => 
                        setFolderProcessingModes(prev => ({ ...prev, [folder]: value }))
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="combined">Combined</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {folderFiles.map((file, index) => (
                      <Badge key={index} variant="outline" className="justify-start text-xs">
                        {file.original_filename}
                      </Badge>
                    ))}
                  </div>
                  
                  <p className="text-xs text-muted-foreground mt-2">
                    {folderProcessingModes[folder] === 'combined' 
                      ? 'All files in this folder will be processed together, creating combined results.'
                      : 'Each file will be processed separately, creating individual results.'
                    }
                  </p>
                </div>
              )
            })}
          </div>
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
                        {loadingDataTypes ? (
                          <SelectItem value="loading" disabled>Loading data types...</SelectItem>
                        ) : dataTypes.length === 0 ? (
                          <SelectItem value="no-data" disabled>No data types available</SelectItem>
                        ) : (
                          dataTypes.map(type => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.display_name}
                            </SelectItem>
                          ))
                        )}
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
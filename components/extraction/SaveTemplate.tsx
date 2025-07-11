'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useCreateTemplate } from "@/hooks/useExtraction"
import { Save, Loader2 } from "lucide-react"
import type { ColumnConfig } from './FieldConfiguration'

interface SaveTemplateProps {
  columnConfigs: ColumnConfig[]
}

export default function SaveTemplate({ columnConfigs }: SaveTemplateProps) {
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState("")
  const [saveTemplateDescription, setSaveTemplateDescription] = useState("")
  const createTemplateMutation = useCreateTemplate()

  const handleSaveTemplate = async () => {
    if (!saveTemplateName.trim()) {
      alert("Please enter a template name")
      return
    }

    try {
      const fields = columnConfigs.map(config => ({
        name: config.customName,
        data_type: config.dataFormat,
        prompt: config.prompt
      }))

      await createTemplateMutation.mutateAsync({
        name: saveTemplateName.trim(),
        description: saveTemplateDescription.trim() || undefined,
        fields,
        is_public: false
      })

      // Reset form
      setSaveTemplateName("")
      setSaveTemplateDescription("")
      setShowSaveTemplate(false)
      alert("Template saved successfully!")
    } catch (error: any) {
      alert(`Failed to save template: ${error.message}`)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900">Save as Template</h4>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowSaveTemplate(!showSaveTemplate)}
        >
          {showSaveTemplate ? 'Cancel' : 'Save Template'}
        </Button>
      </div>
      
      {showSaveTemplate && (
        <div className="space-y-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
            <Input
              placeholder="Enter template name..."
              value={saveTemplateName}
              onChange={(e) => setSaveTemplateName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
            <Textarea
              placeholder="Describe what this template is for..."
              value={saveTemplateDescription}
              onChange={(e) => setSaveTemplateDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex space-x-2">
            <Button 
              onClick={handleSaveTemplate} 
              disabled={!saveTemplateName.trim() || createTemplateMutation.isPending}
              className="flex-1"
            >
              {createTemplateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Template
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
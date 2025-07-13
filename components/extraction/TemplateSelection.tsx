'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTemplates, type TemplatesResponse } from "@/hooks/useExtraction"

interface TemplateSelectionProps {
  selectedTemplate: string
  onTemplateSelect: (templateId: string) => void
}

export default function TemplateSelection({ selectedTemplate, onTemplateSelect }: TemplateSelectionProps) {
  const { data: templatesData } = useTemplates()
  const typedTemplatesData = templatesData as TemplatesResponse | undefined

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Template Selection</label>
      <Select value={selectedTemplate} onValueChange={onTemplateSelect}>
        <SelectTrigger>
          <SelectValue placeholder="Select a template" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="custom">Custom Configuration</SelectItem>
          {(typedTemplatesData as any)?.templates?.map((template: any) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
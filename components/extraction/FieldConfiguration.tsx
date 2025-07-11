'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Plus, X } from "lucide-react"

export interface ColumnConfig {
  id: string
  customName: string
  dataFormat: string
  prompt: string
}

interface FieldConfigurationProps {
  columnConfigs: ColumnConfig[]
  setColumnConfigs: (configs: ColumnConfig[]) => void
}

const dataTypes = [
  "Text", "Number", "Currency", "Date (MM/DD/YYYY)", "Date (DD/MM/YYYY)", 
  "Date (YYYY-MM-DD)", "Percentage", "Email", "Phone Number", "Boolean (Yes/No)", 
  "Address", "Name", "Invoice Number", "Tax ID", "SKU/Product Code", 
  "Decimal (2 places)", "Integer", "Time (HH:MM)", "URL"
]

export default function FieldConfiguration({ columnConfigs, setColumnConfigs }: FieldConfigurationProps) {
  const addColumn = () => {
    const newId = (columnConfigs.length + 1).toString()
    setColumnConfigs([
      ...columnConfigs,
      { id: newId, customName: "", dataFormat: "Text", prompt: "" }
    ])
  }

  const removeColumn = (id: string) => {
    setColumnConfigs(columnConfigs.filter(config => config.id !== id))
  }

  const updateColumn = (id: string, field: keyof ColumnConfig, value: string) => {
    setColumnConfigs(columnConfigs.map(config => 
      config.id === id ? { ...config, [field]: value } : config
    ))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Field Configuration</h3>
        <Button onClick={addColumn} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Field
        </Button>
      </div>

      <div className="space-y-4">
        {columnConfigs.map((config) => (
          <div key={config.id} className="p-4 border border-gray-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Field {config.id}</h4>
              {columnConfigs.length > 1 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => removeColumn(config.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`name-${config.id}`}>Field Name</Label>
                <Input
                  id={`name-${config.id}`}
                  placeholder="e.g., Invoice Number"
                  value={config.customName}
                  onChange={(e) => updateColumn(config.id, 'customName', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor={`type-${config.id}`}>Data Type</Label>
                <Select 
                  value={config.dataFormat} 
                  onValueChange={(value) => updateColumn(config.id, 'dataFormat', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dataTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor={`prompt-${config.id}`}>Extraction Prompt</Label>
              <Textarea
                id={`prompt-${config.id}`}
                placeholder="Describe what to extract and where to find it..."
                value={config.prompt}
                onChange={(e) => updateColumn(config.id, 'prompt', e.target.value)}
                rows={2}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
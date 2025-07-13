'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, GripVertical } from "lucide-react"

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
  const generateUniqueId = () => {
    // Generate a unique ID that won't conflict with existing ones
    const existingIds = columnConfigs.map(config => parseInt(config.id)).filter(id => !isNaN(id))
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0
    return (maxId + 1).toString()
  }

  const addColumn = () => {
    const newId = generateUniqueId()
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

  const moveColumn = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= columnConfigs.length) return
    
    const newConfigs = [...columnConfigs]
    const [movedItem] = newConfigs.splice(fromIndex, 1)
    newConfigs.splice(toIndex, 0, movedItem)
    setColumnConfigs(newConfigs)
  }

  const moveUp = (index: number) => {
    moveColumn(index, index - 1)
  }

  const moveDown = (index: number) => {
    moveColumn(index, index + 1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Field Configuration</h3>
        <Button onClick={addColumn} size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Field
        </Button>
      </div>

      {columnConfigs.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-300">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-gray-400 mb-4">
              <Plus className="w-12 h-12" />
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">No fields configured</h4>
            <p className="text-gray-500 text-center mb-4">
              Add your first field to start extracting data from your documents
            </p>
            <Button onClick={addColumn} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Field
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Horizontal Layout */}
          <div className="hidden lg:block">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <div className="flex" style={{ width: `${columnConfigs.length * 350}px` }}>
                  {columnConfigs.map((config, index) => (
                    <div key={config.id} className="flex-shrink-0 border-r border-gray-200 last:border-r-0" style={{ width: '350px' }}>
                      {/* Column Header */}
                      <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <GripVertical className="w-3 h-3 text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">Field {index + 1}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveUp(index)}
                              disabled={index === 0}
                              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                              title="Move Left"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => moveDown(index)}
                              disabled={index === columnConfigs.length - 1}
                              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                              title="Move Right"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeColumn(config.id)}
                              disabled={columnConfigs.length === 1}
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-600 disabled:opacity-30"
                              title="Delete Field"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Column Content */}
                      <div className="p-3 space-y-3">
                        {/* Field Name */}
                        <div>
                          <Label className="text-xs font-medium text-gray-700 mb-1 block">Field Name</Label>
                          <Input
                            placeholder="e.g., Invoice Number"
                            value={config.customName}
                            onChange={(e) => updateColumn(config.id, 'customName', e.target.value)}
                            className="w-full text-sm"
                          />
                        </div>

                        {/* Data Type */}
                        <div>
                          <Label className="text-xs font-medium text-gray-700 mb-1 block">Data Type</Label>
                          <Select 
                            value={config.dataFormat} 
                            onValueChange={(value) => updateColumn(config.id, 'dataFormat', value)}
                          >
                            <SelectTrigger className="w-full text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {dataTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Extraction Prompt */}
                        <div>
                          <Label className="text-xs font-medium text-gray-700 mb-1 block">Extraction Prompt</Label>
                          <Textarea
                            placeholder="Describe what to extract..."
                            value={config.prompt}
                            onChange={(e) => updateColumn(config.id, 'prompt', e.target.value)}
                            rows={3}
                            className="w-full resize-none text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile/Tablet Vertical Layout */}
          <div className="lg:hidden space-y-4">
            {columnConfigs.map((config, index) => (
              <Card key={config.id} className="border border-gray-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <GripVertical className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">Field {index + 1}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => moveDown(index)}
                        disabled={index === columnConfigs.length - 1}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeColumn(config.id)}
                        disabled={columnConfigs.length === 1}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 disabled:opacity-30"
                        title="Delete Field"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1 block">Field Name</Label>
                      <Input
                        placeholder="e.g., Invoice Number"
                        value={config.customName}
                        onChange={(e) => updateColumn(config.id, 'customName', e.target.value)}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1 block">Data Type</Label>
                      <Select 
                        value={config.dataFormat} 
                        onValueChange={(value) => updateColumn(config.id, 'dataFormat', value)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {dataTypes.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1 block">Extraction Prompt</Label>
                      <Textarea
                        placeholder="Describe what to extract and where to find it..."
                        value={config.prompt}
                        onChange={(e) => updateColumn(config.id, 'prompt', e.target.value)}
                        rows={3}
                        className="w-full resize-none"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
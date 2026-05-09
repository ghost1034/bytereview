'use client'

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Plus,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'

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
  'Text',
  'Number',
  'Currency',
  'Date (MM/DD/YYYY)',
  'Date (DD/MM/YYYY)',
  'Date (YYYY-MM-DD)',
  'Percentage',
  'Email',
  'Phone Number',
  'Boolean (Yes/No)',
  'Address',
  'Name',
  'Invoice Number',
  'Tax ID',
  'SKU/Product Code',
  'Decimal (2 places)',
  'Integer',
  'Time (HH:MM)',
  'URL',
]

const COLUMN_WIDTH_REM = 22 // ~352px

export default function FieldConfiguration({
  columnConfigs,
  setColumnConfigs,
}: FieldConfigurationProps) {
  const generateUniqueId = () => {
    const existingIds = columnConfigs
      .map((config) => parseInt(config.id))
      .filter((id) => !isNaN(id))
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0
    return (maxId + 1).toString()
  }

  const addColumn = () => {
    const newId = generateUniqueId()
    setColumnConfigs([
      ...columnConfigs,
      { id: newId, customName: '', dataFormat: 'Text', prompt: '' },
    ])
  }

  const removeColumn = (id: string) => {
    setColumnConfigs(columnConfigs.filter((config) => config.id !== id))
  }

  const updateColumn = (
    id: string,
    field: keyof ColumnConfig,
    value: string,
  ) => {
    setColumnConfigs(
      columnConfigs.map((config) =>
        config.id === id ? { ...config, [field]: value } : config,
      ),
    )
  }

  const moveColumn = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= columnConfigs.length) return
    const newConfigs = [...columnConfigs]
    const [movedItem] = newConfigs.splice(fromIndex, 1)
    newConfigs.splice(toIndex, 0, movedItem)
    setColumnConfigs(newConfigs)
  }

  const moveUp = (index: number) => moveColumn(index, index - 1)
  const moveDown = (index: number) => moveColumn(index, index + 1)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          Fields to extract
        </h3>
        <Button onClick={addColumn} size="sm">
          <Plus className="mr-1.5 size-4" aria-hidden />
          Add field
        </Button>
      </div>

      {columnConfigs.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No fields configured"
          description="Add your first field to start extracting data from your documents."
          action={
            <Button onClick={addColumn}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              Add your first field
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop horizontal layout */}
          <div className="hidden lg:block">
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <div
                  className="flex"
                  style={{
                    width: `${columnConfigs.length * COLUMN_WIDTH_REM}rem`,
                  }}
                >
                  {columnConfigs.map((config, index) => (
                    <div
                      key={config.id}
                      className="flex-shrink-0 border-r border-border last:border-r-0"
                      style={{ width: `${COLUMN_WIDTH_REM}rem` }}
                    >
                      <div className="flex items-center justify-between border-b border-border bg-surface-muted px-3 py-2">
                        <div className="flex items-center gap-2">
                          <GripVertical
                            className="size-3 text-foreground-subtle"
                            aria-hidden
                          />
                          <span className="text-xs font-medium text-foreground">
                            Field {index + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveUp(index)}
                            disabled={index === 0}
                            aria-label={`Move field ${index + 1} left`}
                            className="size-6 text-foreground-subtle hover:text-foreground"
                          >
                            <ChevronLeft className="size-3" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => moveDown(index)}
                            disabled={index === columnConfigs.length - 1}
                            aria-label={`Move field ${index + 1} right`}
                            className="size-6 text-foreground-subtle hover:text-foreground"
                          >
                            <ChevronRight className="size-3" aria-hidden />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeColumn(config.id)}
                            disabled={columnConfigs.length === 1}
                            aria-label={`Remove field ${index + 1}`}
                            className="size-6 text-destructive/70 hover:text-destructive"
                          >
                            <X className="size-3" aria-hidden />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3 p-3">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`field-name-${config.id}`}
                            className="text-xs font-medium text-foreground-muted"
                          >
                            Field name
                          </Label>
                          <Input
                            id={`field-name-${config.id}`}
                            placeholder="e.g., Invoice Number"
                            value={config.customName}
                            onChange={(e) =>
                              updateColumn(
                                config.id,
                                'customName',
                                e.target.value,
                              )
                            }
                            className="w-full text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor={`field-type-${config.id}`}
                            className="text-xs font-medium text-foreground-muted"
                          >
                            Data type
                          </Label>
                          <Select
                            value={config.dataFormat}
                            onValueChange={(value) =>
                              updateColumn(config.id, 'dataFormat', value)
                            }
                          >
                            <SelectTrigger
                              id={`field-type-${config.id}`}
                              className="w-full text-sm"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {dataTypes.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label
                            htmlFor={`field-prompt-${config.id}`}
                            className="text-xs font-medium text-foreground-muted"
                          >
                            Extraction prompt
                          </Label>
                          <Textarea
                            id={`field-prompt-${config.id}`}
                            placeholder="Describe what to extract…"
                            value={config.prompt}
                            onChange={(e) =>
                              updateColumn(
                                config.id,
                                'prompt',
                                e.target.value,
                              )
                            }
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

          {/* Mobile / tablet vertical layout */}
          <div className="space-y-3 lg:hidden">
            {columnConfigs.map((config, index) => (
              <div
                key={config.id}
                className="rounded-lg border border-border bg-surface-raised p-4 shadow-xs"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical
                      className="size-4 text-foreground-subtle"
                      aria-hidden
                    />
                    <span className="text-sm font-medium text-foreground">
                      Field {index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveUp(index)}
                      disabled={index === 0}
                      aria-label={`Move field ${index + 1} up`}
                      className="size-8 text-foreground-subtle hover:text-foreground"
                    >
                      <ChevronUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveDown(index)}
                      disabled={index === columnConfigs.length - 1}
                      aria-label={`Move field ${index + 1} down`}
                      className="size-8 text-foreground-subtle hover:text-foreground"
                    >
                      <ChevronDown className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeColumn(config.id)}
                      disabled={columnConfigs.length === 1}
                      aria-label={`Remove field ${index + 1}`}
                      className="size-8 text-destructive/80 hover:text-destructive"
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`mfield-name-${config.id}`}
                      className="text-sm font-medium text-foreground-muted"
                    >
                      Field name
                    </Label>
                    <Input
                      id={`mfield-name-${config.id}`}
                      placeholder="e.g., Invoice Number"
                      value={config.customName}
                      onChange={(e) =>
                        updateColumn(config.id, 'customName', e.target.value)
                      }
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`mfield-type-${config.id}`}
                      className="text-sm font-medium text-foreground-muted"
                    >
                      Data type
                    </Label>
                    <Select
                      value={config.dataFormat}
                      onValueChange={(value) =>
                        updateColumn(config.id, 'dataFormat', value)
                      }
                    >
                      <SelectTrigger
                        id={`mfield-type-${config.id}`}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {dataTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`mfield-prompt-${config.id}`}
                      className="text-sm font-medium text-foreground-muted"
                    >
                      Extraction prompt
                    </Label>
                    <Textarea
                      id={`mfield-prompt-${config.id}`}
                      placeholder="Describe what to extract and where to find it…"
                      value={config.prompt}
                      onChange={(e) =>
                        updateColumn(config.id, 'prompt', e.target.value)
                      }
                      rows={3}
                      className="w-full resize-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

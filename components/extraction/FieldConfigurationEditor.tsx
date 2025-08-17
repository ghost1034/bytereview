"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { FieldConfig } from '@/lib/api';

interface DataType {
  id: string;
  display_name: string;
  description: string;
}

interface FieldConfigurationEditorProps {
  fields: FieldConfig[];
  onFieldsChange: (fields: FieldConfig[]) => void;
  dataTypes: DataType[];
  mode?: 'template' | 'job';
  className?: string;
}

export default function FieldConfigurationEditor({
  fields,
  onFieldsChange,
  dataTypes,
  mode = 'job',
  className = ''
}: FieldConfigurationEditorProps) {
  
  const addField = () => {
    const newFields = [...fields, { name: '', data_type: '', prompt: '' }];
    onFieldsChange(newFields);
  };

  const removeField = (index: number) => {
    if (fields.length > 1) {
      const newFields = fields.filter((_, i) => i !== index);
      onFieldsChange(newFields);
    }
  };

  const updateField = (index: number, field: Partial<FieldConfig>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...field };
    onFieldsChange(newFields);
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= fields.length) return;
    
    const newFields = [...fields];
    const [movedField] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, movedField);
    onFieldsChange(newFields);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-base font-semibold">Extraction Fields</Label>
          {mode === 'template' && (
            <p className="text-sm text-gray-600 mt-1">
              Define the fields that will be extracted from documents
            </p>
          )}
        </div>
        <Button type="button" onClick={addField} size="sm" variant="outline">
          <Plus className="w-4 h-4 mr-2" />
          Add Field
        </Button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-2">
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Field Name</Label>
                    <Input
                      value={field.name}
                      onChange={(e) => updateField(index, { name: e.target.value })}
                      placeholder="e.g., invoice_number"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Data Type</Label>
                    <Select
                      value={field.data_type}
                      onValueChange={(value) => updateField(index, { data_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {dataTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            <div>
                              <div>{type.display_name}</div>
                              {mode === 'template' && type.description && (
                                <div className="text-xs text-gray-500">{type.description}</div>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>AI Prompt (Optional)</Label>
                    <Textarea
                      value={field.prompt}
                      onChange={(e) => updateField(index, { prompt: e.target.value })}
                      placeholder="Extract the invoice number (optional)"
                      rows={2}
                      maxLength={500}
                    />
                    <div className="flex justify-between items-center">
                      {mode === 'job' ? (
                        <p className="text-xs text-gray-500">
                          Provide specific instructions for extraction (optional)
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500">
                          Optional instructions for AI extraction
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        {field.prompt.length}/500
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="flex-shrink-0 flex flex-col gap-2">
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveField(index, index - 1)}
                      title="Move up"
                    >
                      ↑
                    </Button>
                  )}
                  {index < fields.length - 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => moveField(index, index + 1)}
                      title="Move down"
                    >
                      ↓
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeField(index)}
                    disabled={fields.length === 1}
                    title="Remove field"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {fields.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-500 mb-4">No fields defined yet</p>
          <Button onClick={addField} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Field
          </Button>
        </div>
      )}
    </div>
  );
}
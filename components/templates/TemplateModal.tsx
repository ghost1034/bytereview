"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCreateTemplate, useUpdateTemplate } from '@/hooks/useExtraction';
import FieldConfigurationEditor from '@/components/extraction/FieldConfigurationEditor';
import type { FieldConfig } from '@/lib/api';

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: {
    id: string;
    name: string;
    description?: string;
    fields: FieldConfig[];
    is_public: boolean;
    template_type?: 'extraction' | 'cpe';
  } | null;
  defaultTemplateType?: 'extraction' | 'cpe';
  dataTypes: Array<{
    id: string;
    display_name: string;
    description: string;
  }>;
  dataTypesLoading: boolean;
}

export default function TemplateModal({ isOpen, onClose, template, defaultTemplateType = 'extraction', dataTypes, dataTypesLoading }: TemplateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState<'extraction' | 'cpe'>(defaultTemplateType);
  const [fields, setFields] = useState<FieldConfig[]>([
    { name: '', data_type: '', prompt: '' }
  ]);

  const { toast } = useToast();
  const createTemplateMutation = useCreateTemplate();
  const updateTemplateMutation = useUpdateTemplate();


  // Reset form when modal opens/closes or template changes
  useEffect(() => {
    if (isOpen) {
      if (template) {
        setName(template.name);
        setDescription(template.description || '');
        setTemplateType(template.template_type || 'extraction');
        setFields(template.fields.length > 0 ? template.fields : [{ name: '', data_type: '', prompt: '' }]);
      } else {
        setName('');
        setDescription('');
        setTemplateType(defaultTemplateType);
        setFields([{ name: '', data_type: '', prompt: '' }]);
      }
    }
  }, [isOpen, template, defaultTemplateType]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Template name is required",
        variant: "destructive"
      });
      return;
    }

    // Check that all fields have both name and data type
    const incompleteFields = fields.filter(f => !f.name.trim() || !f.data_type);
    if (incompleteFields.length > 0) {
      toast({
        title: "Validation Error", 
        description: "All fields must have both a name and data type",
        variant: "destructive"
      });
      return;
    }

    if (fields.length === 0) {
      toast({
        title: "Validation Error", 
        description: "At least one field is required",
        variant: "destructive"
      });
      return;
    }

    try {
      const templateData = {
        name: name.trim(),
        description: description.trim() || undefined,
        fields: fields,
        is_public: false, // Always false for user-created templates
        template_type: templateType,
      };

      if (template) {
        await updateTemplateMutation.mutateAsync({
          templateId: template.id,
          // Keep template_type immutable in UI for now
          templateData: {
            name: templateData.name,
            description: templateData.description,
            fields: templateData.fields,
            is_public: templateData.is_public,
          }
        });
        toast({
          title: "Template Updated",
          description: "Template updated successfully!"
        });
      } else {
        await createTemplateMutation.mutateAsync(templateData as any);
        toast({
          title: "Template Created",
          description: "Template created successfully!"
        });
      }

      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive"
      });
    }
  };

  const isLoading = createTemplateMutation.isPending || updateTemplateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {template ? 'Edit Template' : 'Create New Template'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Scrollable content */}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
            {/* Basic Info */}
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Invoice Extraction"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this template extracts..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Template Type</Label>
              <Select value={templateType} onValueChange={(v) => setTemplateType(v as any)} disabled={!!template}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="extraction">Extraction</SelectItem>
                  <SelectItem value="cpe">CPE</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {templateType === 'cpe'
                  ? 'CPE templates are used by the CPE Tracker workflow.'
                  : 'Extraction templates are used in the standard extraction job workflow.'}
              </p>
            </div>

            {/* Fields */}
            <div className="min-h-[320px]">
              {dataTypesLoading ? (
                <div className="flex min-h-[320px] items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-purple-600"></div>
                    <p className="text-gray-600">Loading field configuration...</p>
                  </div>
                </div>
              ) : (
                <FieldConfigurationEditor
                  fields={fields}
                  onFieldsChange={setFields}
                  dataTypes={dataTypes}
                  mode="template"
                />
              )}
            </div>
          </div>

          {/* Non-scrollable actions */}
          <div className="shrink-0 border-t pt-4">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : (template ? 'Update Template' : 'Create Template')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

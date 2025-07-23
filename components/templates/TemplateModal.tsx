"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useCreateTemplate, useUpdateTemplate } from '@/hooks/useExtraction';
import FieldConfigurationEditor from '@/components/extraction/FieldConfigurationEditor';
import { apiClient } from '@/lib/api';
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
  } | null;
  dataTypes: Array<{
    id: string;
    display_name: string;
    description: string;
  }>;
  dataTypesLoading: boolean;
}

export default function TemplateModal({ isOpen, onClose, template, dataTypes, dataTypesLoading }: TemplateModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
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
        setIsPublic(template.is_public);
        setFields(template.fields.length > 0 ? template.fields : [{ name: '', data_type: '', prompt: '' }]);
      } else {
        setName('');
        setDescription('');
        setIsPublic(false);
        setFields([{ name: '', data_type: '', prompt: '' }]);
      }
    }
  }, [isOpen, template]);


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

    const validFields = fields.filter(f => f.name.trim() && f.data_type && f.prompt.trim());
    if (validFields.length === 0) {
      toast({
        title: "Validation Error", 
        description: "At least one complete field is required",
        variant: "destructive"
      });
      return;
    }

    try {
      const templateData = {
        name: name.trim(),
        description: description.trim() || undefined,
        fields: validFields,
        is_public: false // Always false for user-created templates
      };

      if (template) {
        await updateTemplateMutation.mutateAsync({
          templateId: template.id,
          templateData
        });
        toast({
          title: "Template Updated",
          description: "Template updated successfully!"
        });
      } else {
        await createTemplateMutation.mutateAsync(templateData);
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Edit Template' : 'Create New Template'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* Fields */}
          <div className="h-[400px] overflow-y-auto">
            {dataTypesLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading field configuration...</p>
                </div>
              </div>
            ) : (
              <div className="h-full">
                <FieldConfigurationEditor
                  fields={fields}
                  onFieldsChange={setFields}
                  dataTypes={dataTypes}
                  mode="template"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : (template ? 'Update Template' : 'Create Template')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
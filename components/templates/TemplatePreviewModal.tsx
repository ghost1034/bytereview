"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useCreateTemplate } from '@/hooks/useExtraction';
import { Globe, Lock, FileText, Plus } from 'lucide-react';
import type { FieldConfig } from '@/lib/api';

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: {
    id: string;
    name: string;
    description?: string;
    fields: FieldConfig[];
    is_public: boolean;
    created_at: string;
  } | null;
}

export default function TemplatePreviewModal({ 
  isOpen, 
  onClose, 
  template
}: TemplatePreviewModalProps) {
  const { toast } = useToast();
  const createTemplateMutation = useCreateTemplate();
  const [isCopying, setIsCopying] = useState(false);

  if (!template) return null;

  const handleCopyTemplate = async () => {
    try {
      setIsCopying(true);
      await createTemplateMutation.mutateAsync({
        name: template.name,
        description: template.description,
        fields: template.fields,
        is_public: false,
      });
      toast({
        title: 'Template saved',
        description: 'Added a copy to your personal templates.',
      });
      onClose();
    } catch (error: any) {
      toast({
        title: 'Failed to save template',
        description: error.message || 'Could not create a copy of this template.',
        variant: 'destructive',
      });
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span>{template.name}</span>
                <Badge variant={template.is_public ? "default" : "outline"}>
                  {template.is_public ? (
                    <>
                      <Globe className="w-3 h-3 mr-1" />
                      Public
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3 mr-1" />
                      Private
                    </>
                  )}
                </Badge>
              </div>
              {template.description && (
                <p className="text-sm text-gray-600 mt-1">{template.description}</p>
              )}
            </div>
            {template.is_public && (
              <Button onClick={handleCopyTemplate} disabled={isCopying} size="sm" className="mr-8">
                {isCopying ? (
                  'Saving...'
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1" /> Add to My Templates
                  </>
                )}
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">Fields:</span>
              <span className="ml-2">{template.fields.length}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Created:</span>
              <span className="ml-2">{new Date(template.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Fields Preview */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Fields Configuration</h3>
            
            {template.fields.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No fields configured in this template</p>
              </div>
            ) : (
              <div className="space-y-3">
                {template.fields.map((field, index) => (
                  <Card key={index} className="border-l-4 border-l-purple-500">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Field Name</label>
                          <p className="mt-1 text-sm bg-gray-50 p-2 rounded border">
                            {field.name || <span className="text-gray-400">Not specified</span>}
                          </p>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium text-gray-700">Data Type</label>
                          <p className="mt-1 text-sm bg-gray-50 p-2 rounded border">
                            {field.data_type}
                          </p>
                        </div>
                        
                        <div className="md:col-span-1">
                          <label className="text-sm font-medium text-gray-700">AI Prompt</label>
                          <p className="mt-1 text-sm bg-gray-50 p-2 rounded border min-h-[2.5rem]">
                            {field.prompt || <span className="text-gray-400">Not specified</span>}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Usage Note */}
          {template.is_public && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Public Template</h4>
                  <p className="text-sm text-blue-800 mt-1">
                    This template is available to all users. You can use it as a starting point 
                    for your extraction jobs and customize the fields as needed.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

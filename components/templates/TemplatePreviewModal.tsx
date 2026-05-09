"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
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
    template_type?: 'extraction' | 'cpe';
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
      const templateType = template.template_type === 'cpe' ? 'cpe' : 'extraction';
      await createTemplateMutation.mutateAsync({
        name: template.name,
        description: template.description,
        fields: template.fields,
        is_public: false,
        template_type: templateType,
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
            <IconTile icon={FileText} tone="brand" size="md" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span>{template.name}</span>
                <Badge variant="secondary">
                  {template.template_type === 'cpe' ? 'CPE' : 'Extraction'}
                </Badge>
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
                <p className="text-sm text-foreground-muted mt-1">{template.description}</p>
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
              <span className="font-medium text-foreground-muted">Fields:</span>
              <span className="ml-2 tabular-nums text-foreground">{template.fields.length}</span>
            </div>
            <div>
              <span className="font-medium text-foreground-muted">Created:</span>
              <span className="ml-2 text-foreground">{new Date(template.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Fields Preview */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Fields Configuration</h3>
            
            {template.fields.length === 0 ? (
              <div className="text-center py-8 text-foreground-subtle">
                <FileText className="w-12 h-12 mx-auto mb-4 text-foreground-subtle/50" />
                <p>No fields configured in this template</p>
              </div>
            ) : (
              <div className="space-y-3">
                {template.fields.map((field, index) => (
                  <div key={index} className="rounded-lg border border-border bg-surface-raised border-l-4 border-l-primary p-4 shadow-xs">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium text-foreground-muted">Field name</label>
                        <p className="mt-1 text-sm bg-surface-muted p-2 rounded border border-border text-foreground">
                          {field.name || <span className="text-foreground-subtle">Not specified</span>}
                        </p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-foreground-muted">Data type</label>
                        <p className="mt-1 text-sm bg-surface-muted p-2 rounded border border-border text-foreground">
                          {field.data_type}
                        </p>
                      </div>

                      <div className="md:col-span-1">
                        <label className="text-sm font-medium text-foreground-muted">AI prompt</label>
                        <p className="mt-1 text-sm bg-surface-muted p-2 rounded border border-border min-h-[2.5rem] whitespace-pre-wrap break-words text-foreground">
                          {field.prompt || <span className="text-foreground-subtle">Not specified</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Usage Note */}
          {template.is_public && (
            <div className="bg-primary-soft border border-primary/15 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Globe className="w-5 h-5 text-primary-soft-foreground mt-0.5" />
                <div>
                  <h4 className="font-medium text-primary-soft-foreground">Public template</h4>
                  <p className="text-sm text-primary-soft-foreground/80 mt-1">
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

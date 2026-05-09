"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  useTemplates,
  useDeleteTemplate,
  type TemplatesResponse,
} from "@/hooks/useExtraction";
import { Edit, Trash2, Star } from "lucide-react";

interface TemplateLibraryProps {
  onTemplateSelect: (templateId: string) => void;
}

export default function TemplateLibrary({
  onTemplateSelect,
}: TemplateLibraryProps) {
  const { data: templatesData } = useTemplates();
  const deleteTemplateMutation = useDeleteTemplate();
  const typedTemplatesData = templatesData as TemplatesResponse | undefined;
  const { toast } = useToast();

  const extractionTemplates = ((typedTemplatesData as any)?.templates || []).filter(
    (template: any) => (template?.template_type ?? 'extraction') === 'extraction'
  );

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) {
      return;
    }

    try {
      await deleteTemplateMutation.mutateAsync(templateId);
      toast({
        title: "Template deleted",
        description: "Template deleted successfully!"
      });
    } catch (error: any) {
      toast({
        title: "Failed to delete template",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          My template library
        </h3>
        <p className="text-sm text-foreground-muted">
          Manage your saved extraction templates
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {extractionTemplates.length > 0 ? (
          extractionTemplates.map((template: any) => (
              <Card
              key={template.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-foreground mb-1">
                      {template.name}
                    </h3>
                    <p className="text-sm text-foreground-muted">
                      {template.description || "No description"}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1">
                    {template.is_public && (
                      <Star className="w-4 h-4 text-warning" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete template"
                      onClick={() => handleDeleteTemplate(template.id)}
                      disabled={deleteTemplateMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-foreground-subtle mb-3">
                  <p>Fields: {template.fields?.length || 0}</p>
                  <p>
                    Created:{" "}
                    {new Date(template.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onTemplateSelect(template.id)}
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Use template
                  </Button>
                </div>
              </CardContent>
              </Card>
          ))
        ) : (
          <div className="col-span-full text-center py-8">
            <p className="text-foreground-muted">
              No templates created yet. Save your first template from the
              Extract Data tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

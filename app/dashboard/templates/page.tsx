"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Plus,
  Loader2,
  Edit,
  Trash2,
  Globe,
  Lock,
  Eye,
} from "lucide-react";
import {
  useTemplates,
  usePublicTemplates,
  useDeleteTemplate,
} from "@/hooks/useExtraction";
import { useToast } from "@/hooks/use-toast";
import { useDataTypes } from "@/hooks/useDataTypes";
import TemplateModal from "@/components/templates/TemplateModal";
import TemplatePreviewModal from "@/components/templates/TemplatePreviewModal";

export default function TemplatesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);

  const { data: templatesData, isLoading: templatesLoading } = useTemplates();
  const { data: publicTemplatesData, isLoading: publicLoading } =
    usePublicTemplates();
  const { data: dataTypes = [], isLoading: dataTypesLoading } = useDataTypes();
  const deleteTemplateMutation = useDeleteTemplate();
  const { toast } = useToast();

  const userTemplates = (templatesData as any)?.templates || [];
  const publicTemplates = (publicTemplatesData as any)?.templates || [];
  const loading = templatesLoading || publicLoading;

  const handleEditTemplate = (template: any) => {
    setEditingTemplate(template);
    setModalOpen(true);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setModalOpen(true);
  };

  const handleDeleteTemplate = async (
    templateId: string,
    templateName: string
  ) => {
    if (!confirm(`Are you sure you want to delete "${templateName}"?`)) {
      return;
    }

    try {
      await deleteTemplateMutation.mutateAsync(templateId);
      toast({
        title: "Template Deleted",
        description: "Template deleted successfully!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  const handlePreviewTemplate = (template: any) => {
    setPreviewTemplate(template);
    setPreviewModalOpen(true);
  };

  const renderTemplateCard = (template: any, isPublic = false) => (
    <Card key={template.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={isPublic ? "default" : "outline"}>
              {isPublic ? (
                <Globe className="w-3 h-3 mr-1" />
              ) : (
                <Lock className="w-3 h-3 mr-1" />
              )}
              {isPublic ? "Public" : "Private"}
            </Badge>
            <Badge variant="outline">
              {template.fields?.length || 0} fields
            </Badge>
          </div>
        </div>

        <h3 className="font-medium text-gray-900 mb-1">
          {template.name || "Untitled Template"}
        </h3>

        {template.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {template.description}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
          <span>
            Created {new Date(template.created_at).toLocaleDateString()}
          </span>
        </div>

        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePreviewTemplate(template)}
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
          {!isPublic && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditTemplate(template)}
              >
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteTemplate(template.id, template.name)}
                disabled={deleteTemplateMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-600 mt-1">
            Browse and manage your extraction templates
          </p>
        </div>
        <Button onClick={handleCreateTemplate}>
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Public Templates Section */}
      {publicTemplates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Globe className="w-5 h-5 mr-2" />
              Public Templates ({publicTemplates.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicTemplates.map((template) =>
                renderTemplateCard(template, true)
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Templates Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Lock className="w-5 h-5 mr-2" />
            My Templates ({userTemplates.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" />
              <p className="text-gray-600">Loading templates...</p>
            </div>
          ) : userTemplates.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No personal templates yet
              </h3>
              <p className="text-gray-600 mb-4">
                Create your first template to reuse field configurations across
                jobs.
              </p>
              <Button onClick={handleCreateTemplate}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Template
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userTemplates.map((template) =>
                renderTemplateCard(template, false)
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template Modal */}
      <TemplateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        template={editingTemplate}
        dataTypes={dataTypes}
        dataTypesLoading={dataTypesLoading}
      />

      {/* Template Preview Modal */}
      <TemplatePreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        template={previewTemplate}
      />
    </div>
  );
}

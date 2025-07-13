'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Play, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import SubscriptionManager from "@/components/subscription/SubscriptionManager";
import { useExtractData, useTemplates } from "@/hooks/useExtraction";
import { apiClient } from "@/lib/api";

// Import new components
import UsageStats from "@/components/subscription/UsageStats";
import FileUpload from "@/components/extraction/FileUpload";
import FieldConfiguration, { type ColumnConfig } from "@/components/extraction/FieldConfiguration";
import TemplateSelection from "@/components/extraction/TemplateSelection";
import SaveTemplate from "@/components/extraction/SaveTemplate";
import ExtractionResults from "@/components/extraction/ExtractionResults";
import TemplateLibrary from "@/components/templates/TemplateLibrary";

// ColumnConfig is now imported from FieldConfiguration component

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [uploadedFileIds, setUploadedFileIds] = useState<{file_id: string, filename: string, size_bytes: number}[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState("custom")
  const [extractMultipleRows, setExtractMultipleRows] = useState(false)
  const [extractionResults, setExtractionResults] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("extract")
  const [isUploading, setIsUploading] = useState(false)
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([
    { id: "1", customName: "", dataFormat: "Text", prompt: "" }
  ]);

  // Hooks for API calls
  const extractDataMutation = useExtractData();
  const { data: templatesData } = useTemplates();

  // Template functions
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    
    if (templateId === "custom") {
      // Reset to empty custom configuration
      setColumnConfigs([
        { id: "1", customName: "", dataFormat: "Text", prompt: "" }
      ]);
    } else {
      // Load template configuration
      loadTemplateById(templateId);
    }
  };

  const loadTemplateById = (templateId: string) => {
    try {
      // Find the template in the cached data
      const template = (templatesData as any)?.templates?.find((t: any) => t.id === templateId);
      
      if (!template) {
        toast({
          title: "Template not found",
          description: "The selected template could not be found.",
          variant: "destructive"
        });
        return;
      }
      
      // Convert template fields to column configs
      const configs = template.fields.map((field: any, index: number) => ({
        id: (index + 1).toString(),
        customName: field.name,
        dataFormat: field.data_type,
        prompt: field.prompt
      }));
      
      setColumnConfigs(configs);
      setActiveTab("extract"); // Switch to Extract Data tab
      toast({
        title: "Template loaded",
        description: `Template "${template.name}" loaded successfully!`
      });
      
    } catch (error: any) {
      console.error('Failed to load template:', error);
      toast({
        title: "Failed to load template",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getAuthToken = async () => {
    try {
      const { auth } = await import('@/lib/firebase');
      const user = auth.currentUser;
      if (user) {
        return await user.getIdToken();
      }
      return null;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  };

  // These functions are now handled by the individual components

  // Removed subscription and template mock data - now handled by components and hooks

  const handleExtract = async () => {
    if (uploadedFileIds.length === 0) {
      toast({
        title: "No files uploaded",
        description: "Please upload at least one file first.",
        variant: "destructive"
      });
      return;
    }

    if (columnConfigs.length === 0) {
      toast({
        title: "No fields configured",
        description: "Please add at least one field to extract.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setShowResults(false);
    setExtractionResults(null);

    try {
      // Convert column configs to field configs
      const fields = columnConfigs.map(config => ({
        name: config.customName,
        data_type: config.dataFormat,
        prompt: config.prompt
      }));

      // Call the extraction API with uploaded file IDs
      const fileIds = uploadedFileIds.map(file => file.file_id);
      
      const result = await apiClient.extractFromUploadedFiles(
        fileIds,
        fields,
        extractMultipleRows
      );

      setExtractionResults(result);
      setShowResults(true);

      // Clear uploaded file IDs after successful extraction
      setUploadedFileIds([]);

      if (!(result as any).success) {
        toast({
          title: "Extraction failed",
          description: (result as any).error,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error("Processing failed:", error);
      console.error("Full error object:", error);
      
      // Show more detailed error message
      let errorMessage = "Processing failed";
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      if (error.response?.data?.detail) {
        errorMessage += ` - ${error.response.data.detail}`;
      }
      
      toast({
        title: "Processing failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* User Profile Header */}
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xl font-bold">
                      {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.displayName || 'User'}!</h1>
                    <p className="text-gray-600">{user?.email}</p>
                  </div>
                </div>
                <div className="min-w-0 flex-1 max-w-sm ml-6">
                  <UsageStats />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="extract">Extract Data</TabsTrigger>
            <TabsTrigger value="templates">Template Library</TabsTrigger>
            <TabsTrigger value="account">Account Settings</TabsTrigger>
          </TabsList>

          {/* Extract Data Tab */}
          <TabsContent value="extract" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Upload Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Upload Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <FileUpload 
                    uploadedFiles={uploadedFileIds}
                    onFileUploaded={(fileInfo) => setUploadedFileIds(prev => [...prev, fileInfo])}
                    onFileRemoved={(file_id) => setUploadedFileIds(prev => prev.filter(f => f.file_id !== file_id))}
                  />
                </CardContent>
              </Card>

              {/* Template Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Template Selection</CardTitle>
                </CardHeader>
                <CardContent>
                  <TemplateSelection 
                    selectedTemplate={selectedTemplate}
                    onTemplateSelect={handleTemplateSelect}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Field Configuration */}
            <Card>
              <CardContent className="p-6">
                <FieldConfiguration 
                  columnConfigs={columnConfigs}
                  setColumnConfigs={setColumnConfigs}
                />
              </CardContent>
            </Card>

            {/* Save Template */}
            <Card>
              <CardContent className="p-6">
                <SaveTemplate columnConfigs={columnConfigs} />
              </CardContent>
            </Card>

            {/* Extract Multiple Rows Checkbox */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="extractMultipleRows"
                    checked={extractMultipleRows}
                    onCheckedChange={(checked) => setExtractMultipleRows(checked === true)}
                  />
                  <label 
                    htmlFor="extractMultipleRows" 
                    className="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Extract Multiple Rows per Document
                  </label>
                </div>

                <div className="mt-6 flex justify-center">
                  <Button 
                    onClick={handleExtract} 
                    disabled={isProcessing || uploadedFileIds.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="animate-spin w-4 h-4 mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Extract Data
                      </>
                    )}
                  </Button>
                </div>


              </CardContent>
            </Card>

            {/* Results Section */}
            {showResults && (
              <ExtractionResults 
                extractionResults={extractionResults}
                columnConfigs={columnConfigs}
              />
            )}
          </TabsContent>

          {/* Template Library Tab */}
          <TabsContent value="templates" className="space-y-6">
            <TemplateLibrary onTemplateSelect={handleTemplateSelect} />
          </TabsContent>

          {/* Account Settings Tab */}
          <TabsContent value="account" className="space-y-6">
            <SubscriptionManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
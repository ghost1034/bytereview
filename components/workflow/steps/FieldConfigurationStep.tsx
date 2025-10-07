/**
 * Field Configuration Step for Job Workflow
 * Allows users to define what data to extract from documents
 */
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  ArrowRight,
  Settings,
  FileText,
  Bookmark,
  Wrench,
  Globe,
  Lock,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTemplates, usePublicTemplates } from "@/hooks/useExtraction";
import { useDataTypes } from "@/hooks/useDataTypes";
import FieldConfigurationEditor from "@/components/extraction/FieldConfigurationEditor";
import {
  UploadedFile,
  JobFieldConfig,
  TaskDefinition,
  ProcessingMode,
  FieldConfig,
} from "@/lib/api";

interface FieldConfigurationStepProps {
  files: UploadedFile[];
  initialFields?: JobFieldConfig[];
  initialTaskDefinitions?: TaskDefinition[];
  initialTemplateId?: string;
  onFieldsSaved: (
    fields: JobFieldConfig[],
    taskDefinitions: TaskDefinition[],
    templateId?: string
  ) => Promise<void>;
  onContinue: () => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

export default function FieldConfigurationStep({
  files,
  initialFields,
  initialTaskDefinitions,
  initialTemplateId,
  onFieldsSaved,
  onContinue,
  onBack,
  readOnly = false,
}: FieldConfigurationStepProps) {
  const { toast } = useToast();
  const { data: userTemplates } = useTemplates();
  const { data: publicTemplates } = usePublicTemplates();
  const { data: dataTypes = [], isLoading: dataTypesLoading } = useDataTypes();

  const [fields, setFields] = useState<JobFieldConfig[]>(
    initialFields && initialFields.length > 0
      ? initialFields
      : [
          {
            field_name: "",
            data_type_id: "text",
            ai_prompt: "",
            display_order: 0,
          },
        ]
  );

  // Resync fields when initialFields prop changes (e.g., when run changes)
  useEffect(() => {
    if (initialFields) {
      setFields(
        initialFields.length > 0 ? initialFields : [
          {
            field_name: "",
            data_type_id: "text",
            ai_prompt: "",
            display_order: 0,
          },
        ]
      );
    }
  }, [initialFields]);

  // Convert JobFieldConfig to FieldConfig for the shared component
  const convertToFieldConfig = (jobFields: JobFieldConfig[]): FieldConfig[] => {
    return jobFields.map((field) => ({
      name: field.field_name,
      data_type: field.data_type_id,
      prompt: field.ai_prompt,
    }));
  };

  // Convert FieldConfig back to JobFieldConfig
  const convertFromFieldConfig = (
    fieldConfigs: FieldConfig[]
  ): JobFieldConfig[] => {
    return fieldConfigs.map((field, index) => ({
      field_name: field.name,
      data_type_id: field.data_type,
      ai_prompt: field.prompt,
      display_order: index,
    }));
  };

  const handleFieldsChange = (newFieldConfigs: FieldConfig[]) => {
    const newJobFields = convertFromFieldConfig(newFieldConfigs);
    setFields(newJobFields);
  };

  // Combine user and public templates
  const allTemplates = [
    ...(userTemplates?.templates || []),
    ...(publicTemplates?.templates || []),
  ];

  const [selectedTemplate, setSelectedTemplate] = useState<string>(initialTemplateId || "");
  const [configurationMode, setConfigurationMode] = useState<
    "template" | "custom"
  >(initialTemplateId ? "template" : "custom");

  // Resync template selection and mode when initialTemplateId changes (e.g., when run changes)
  useEffect(() => {
    setSelectedTemplate(initialTemplateId || "");
    setConfigurationMode(initialTemplateId ? "template" : "custom");
  }, [initialTemplateId]);
  const [folderProcessingModes, setFolderProcessingModes] = useState<
    Record<string, ProcessingMode>
  >({});


  // Handle configuration mode change
  const handleConfigurationModeChange = (mode: "template" | "custom") => {
    setConfigurationMode(mode);
    if (mode === "custom") {
      setSelectedTemplate("");
      // Reset to default single field for custom configuration
      setFields([
        {
          field_name: "",
          data_type_id: "text",
          ai_prompt: "",
          display_order: 0,
        },
      ]);
    }
  };

  // Helper function to convert template fields to JobFieldConfig format
  const convertTemplateToJobFields = (template: any): JobFieldConfig[] => {
    return template.fields.map((field, index) => ({
      field_name: field.name,
      data_type_id: field.data_type,
      ai_prompt: field.prompt,
      display_order: index,
    }));
  };

  // Helper function to load template fields
  const loadTemplateFields = (template: any, showToast: boolean = true) => {
    const templateFields = convertTemplateToJobFields(template);
    setFields(templateFields);

    if (showToast) {
      toast({
        title: "Template loaded",
        description: `Loaded ${templateFields.length} fields from "${template.name}". You can customize these fields before proceeding.`,
      });
    }
  };

  // Load initial template when returning to page (only if no saved fields exist)
  useEffect(() => {
    if (
      configurationMode === "template" &&
      selectedTemplate &&
      allTemplates.length > 0 &&
      (!initialFields || initialFields.length === 0)
    ) {
      const template = allTemplates.find((t) => t.id === selectedTemplate);
      if (template) {
        loadTemplateFields(template, false); // Don't show toast for initial load
      }
    }
  }, [configurationMode, userTemplates, publicTemplates, initialFields]); // Removed selectedTemplate and toast from dependencies

  // Handle template selection changes
  const handleTemplateChange = async (templateId: string) => {
    setSelectedTemplate(templateId);
    
    const template = allTemplates.find((t) => t.id === templateId);
    if (template) {
      loadTemplateFields(template, false);
      
      // Auto-save the configuration after loading template
      try {
        const templateFields = convertTemplateToJobFields(template);
        
        // Use shared helper for task definitions
        const taskDefinitions = createTaskDefinitions();
        
        // Auto-save with template ID
        await onFieldsSaved(templateFields, taskDefinitions, templateId);
        
        toast({
          title: "Template applied and saved",
          description: `Template "${template.name}" has been loaded and automatically saved to your job configuration.`,
        });
      } catch (error) {
        toast({
          title: "Auto-save failed",
          description: "Template could not be automatically saved. Please use the Save Configuration button.",
          variant: "destructive",
        });
      }
    }
  };

  // Group files by folder for task definition
  const getFileFolders = () => {
    const folders = new Set<string>();
    files.forEach((file) => {
      const folder = file.original_path.includes("/")
        ? file.original_path.substring(0, file.original_path.lastIndexOf("/"))
        : "/";
      folders.add(folder);
    });
    return Array.from(folders).sort();
  };

  // Initialize processing modes for all folders
  useEffect(() => {
    const folders = getFileFolders();

    // If we have initial task definitions, use those to set processing modes
    const initialModes: Record<string, ProcessingMode> = {};
    if (initialTaskDefinitions && initialTaskDefinitions.length > 0) {
      initialTaskDefinitions.forEach((task) => {
        initialModes[task.path] = task.mode;
      });
    }

    setFolderProcessingModes((prev) => {
      const newModes = { ...prev, ...initialModes };
      folders.forEach((folder) => {
        if (!(folder in newModes)) {
          newModes[folder] = "individual"; // Default to individual
        }
      });
      return newModes;
    });
  }, [files, initialTaskDefinitions]);

  // Get files for a specific folder
  const getFilesInFolder = (folder: string) => {
    return files.filter((file) => {
      const fileFolder = file.original_path.includes("/")
        ? file.original_path.substring(0, file.original_path.lastIndexOf("/"))
        : "/";
      return fileFolder === folder;
    });
  };

  const validateFields = () => {
    const errors: string[] = [];

    if (fields.length === 0) {
      errors.push("At least one field is required");
    }

    fields.forEach((field, index) => {
      if (!field.field_name.trim()) {
        errors.push(`Field ${index + 1}: Name is required`);
      }
      if (!field.data_type_id.trim()) {
        errors.push(`Field ${index + 1}: Data type is required`);
      }
    });

    // Check for duplicate field names
    const fieldNames = fields.map((f) => f.field_name.trim().toLowerCase());
    const duplicates = fieldNames.filter(
      (name, index) => name && fieldNames.indexOf(name) !== index
    );

    if (duplicates.length > 0) {
      errors.push("Duplicate field names are not allowed");
    }

    return errors;
  };

  // Helper function to create task definitions
  const createTaskDefinitions = (): TaskDefinition[] => {
    const folders = getFileFolders();
    return folders.map((folder) => ({
      path: folder,
      mode: folderProcessingModes[folder] || "individual",
    }));
  };

  // Helper function to prepare field data
  const prepareFieldData = () => {
    const taskDefinitions = createTaskDefinitions();

    // Update display order
    const orderedFields = fields.map((field, index) => ({
      ...field,
      display_order: index,
    }));

    // Pass template ID if using template mode and a template is selected
    const templateId =
      configurationMode === "template" && selectedTemplate
        ? selectedTemplate
        : undefined;

    return { orderedFields, taskDefinitions, templateId };
  };

  const handleSave = async () => {
    const errors = validateFields();

    if (errors.length > 0) {
      toast({
        title: "Validation Error",
        description: errors.join(", "),
        variant: "destructive",
      });
      return;
    }

    const { orderedFields, taskDefinitions, templateId } = prepareFieldData();
    await onFieldsSaved(orderedFields, taskDefinitions, templateId);
  };

  const handleContinue = async () => {
    const errors = validateFields();

    if (errors.length > 0) {
      toast({
        title: "Validation Error",
        description: errors.join(", "),
        variant: "destructive",
      });
      return;
    }

    // Save first, then continue
    const { orderedFields, taskDefinitions, templateId } = prepareFieldData();
    await onFieldsSaved(orderedFields, taskDefinitions, templateId);
    await onContinue();
  };

  return (
    <div className="space-y-6">
      {/* File Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Files to Process ({files.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {files.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {files.slice(0, 6).map((file, index) => (
                <Badge key={index} variant="secondary" className="justify-start">
                  {file.original_filename}
                </Badge>
              ))}
              {files.length > 6 && (
                <Badge variant="outline">+{files.length - 6} more files</Badge>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">No files uploaded</p>
              <p className="text-sm">
                You can still configure extraction fields.
                <br />
                Upload files in the previous step to process documents.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Method Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Field Configuration Method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={configurationMode}
            onValueChange={readOnly ? undefined : handleConfigurationModeChange}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
            disabled={readOnly}
          >
            {/* Custom Configuration Option */}
            <div className="flex items-center space-x-2 border rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Wrench className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Custom Configuration</h3>
                    <p className="text-sm text-gray-600">
                      Define fields from scratch
                    </p>
                  </div>
                </div>
              </Label>
            </div>

            {/* Template Configuration Option */}
            <div className="flex items-center space-x-2 border rounded-lg p-4 hover:bg-gray-50 transition-colors">
              <RadioGroupItem
                value="template"
                id="template"
                disabled={allTemplates.length === 0}
              />
              <Label htmlFor="template" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Bookmark className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-medium">Use Template</h3>
                    <p className="text-sm text-gray-600">
                      {allTemplates.length > 0
                        ? `Choose from ${allTemplates.length} saved templates`
                        : "No templates available"}
                    </p>
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>

          {/* Template Selection (shown when template mode is selected) */}
          {configurationMode === "template" && allTemplates.length > 0 && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Select Template</Label>
                <Select
                  value={selectedTemplate}
                  onValueChange={readOnly ? undefined : handleTemplateChange}
                  disabled={readOnly}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Choose a template to start with..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          {template.is_public ? (
                            <Globe className="w-3 h-3 text-blue-500" />
                          ) : (
                            <Lock className="w-3 h-3 text-gray-500" />
                          )}
                          <span>{template.name}</span>
                          <Badge variant="outline" className="ml-2">
                            {template.fields.length} fields
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Template fields will be loaded below.
                    You can customize them before starting the extraction.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Mode per Folder */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Mode by Folder</CardTitle>
        </CardHeader>
        <CardContent>
          {files.length > 0 ? (
            <div className="space-y-4">
              {getFileFolders().map((folder) => {
                const folderFiles = getFilesInFolder(folder);
                return (
                  <div key={folder} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">
                          {folder === "/" ? "Root Folder" : folder}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {folderFiles.length} file
                          {folderFiles.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Select
                        value={folderProcessingModes[folder] || "individual"}
                        onValueChange={readOnly ? undefined : (value: ProcessingMode) =>
                          setFolderProcessingModes((prev) => ({
                            ...prev,
                            [folder]: value,
                          }))
                        }
                        disabled={readOnly}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="combined">Combined</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                      {folderFiles.slice(0, 12).map((file, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="justify-start text-xs"
                        >
                          {file.original_filename}
                        </Badge>
                      ))}
                      {folderFiles.length > 12 && (
                        <Badge variant="secondary" className="justify-center text-xs">
                          +{folderFiles.length - 12} more files
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      {folderProcessingModes[folder] === "combined"
                        ? "All files in this folder will be processed together, creating combined results."
                        : "Each file will be processed separately, creating individual results."}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Settings className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium mb-2">No processing modes to configure</p>
              <p className="text-sm">
                Processing modes will appear here when you upload files.
                <br />
                Each folder can be processed individually or combined.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Field Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Field Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dataTypesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                <span className="text-sm text-gray-600">Loading field configuration...</span>
              </div>
            </div>
          ) : (
            <FieldConfigurationEditor
              fields={convertToFieldConfig(fields)}
              onFieldsChange={readOnly ? () => {} : handleFieldsChange}
              dataTypes={dataTypes}
              mode="job"
              readOnly={readOnly}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={handleSave}
            disabled={readOnly}
          >
            <Save className="w-4 h-4 mr-2" />
            {readOnly ? 'View Only' : 'Save Configuration'}
          </Button>
          
          <Button 
            onClick={handleContinue}
            disabled={files.length === 0 || readOnly}
          >
            {readOnly ? 'View Only' : 'Save and Continue'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Multi-source file upload component
 * Combines computer uploads, Google Drive, and Gmail attachments
 */
'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  FolderOpen, 
  Mail, 
  X, 
  FileText, 
  Paperclip,
  HardDrive,
  Cloud,
  Trash2,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Archive,
  Folder
} from 'lucide-react';
import { GoogleDrivePicker } from '@/components/integrations/GoogleDrivePicker';
import { GmailPicker } from '@/components/integrations/GmailPicker';
import { IntegrationPrompt } from '@/components/integrations/IntegrationBanner';
import { ImportStatusDisplay } from '@/components/upload/ImportStatusDisplay';
import { useToast } from '@/hooks/use-toast';
import { apiClient, type JobFileInfo } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  source: 'computer' | 'drive' | 'gmail';
  path?: string;
  externalId?: string;
  messageId?: string; // For Gmail attachments
  subject?: string; // For Gmail attachments
  from?: string; // For Gmail attachments
}

interface MultiSourceFileUploadProps {
  onFilesChange: (files: UploadedFile[]) => void;
  jobId?: string; // If provided, will trigger automatic import
  acceptedTypes?: string[];
  maxFiles?: number;
  className?: string;
}

export function MultiSourceFileUpload({
  onFilesChange,
  jobId,
  acceptedTypes = ['application/pdf'],
  maxFiles = 100,
  className
}: MultiSourceFileUploadProps) {
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [activeTab, setActiveTab] = useState('computer');
  const [hasTriggeredImports, setHasTriggeredImports] = useState(false);
  
  // Computer upload state
  const [computerFiles, setComputerFiles] = useState<JobFileInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Computer upload functionality (restored from EnhancedFileUpload)
  const handleComputerFileUpload = async (files: FileList | File[]) => {
    if (!jobId || uploading) return;

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Validate files
    const invalidFiles = fileArray.filter(file => {
      const isValidType = acceptedTypes.some(type => 
        file.type === type || file.name.toLowerCase().endsWith(type.split('/')[1])
      );
      const isValidSize = file.size <= 100 * 1024 * 1024; // 100MB limit
      return !isValidType || !isValidSize;
    });

    if (invalidFiles.length > 0) {
      toast({
        title: "Invalid files detected",
        description: `${invalidFiles.length} file(s) are invalid. Please check file types and sizes.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    
    // Initialize progress for all files
    fileArray.forEach((file) => {
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
    });

    try {
      // Setup SSE for real-time updates
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(`/api/jobs/${jobId}/upload-progress`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'upload_progress') {
            setUploadProgress(prev => ({
              ...prev,
              [data.filename]: data.progress
            }));
          } else if (data.type === 'upload_complete') {
            // File upload completed
            setUploadProgress(prev => ({
              ...prev,
              [data.filename]: 100
            }));
          } else if (data.type === 'processing_complete') {
            // All processing completed, refresh files
            handleUploadComplete();
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
      };

      // Upload files using the correct API method
      const result = await apiClient.addFilesToJob(
        jobId, 
        fileArray,
        (filePath, progress) => {
          // This callback might not be used if SSE is working
          setUploadProgress(prev => ({ ...prev, [filePath]: progress }));
        },
        (fileData, filePath) => {
          console.log(`File completed: ${filePath}`);
        }
      );

      // Don't immediately update state - wait for SSE completion
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload files. Please try again.",
        variant: "destructive",
      });
      setUploading(false);
      setUploadProgress({});
    }
  };

  const handleUploadComplete = async () => {
    if (!jobId) return;

    try {
      // Fetch updated job details to get the new files
      const jobDetails = await apiClient.getJobDetails(jobId);
      
      // Convert to unified format
      const newFiles: UploadedFile[] = jobDetails.source_files?.map(file => ({
        id: `computer-${file.id}`,
        name: file.original_filename,
        size: file.file_size_bytes,
        type: file.file_type,
        source: 'computer',
        path: file.original_path
      })) || [];

      setUploadedFiles(newFiles);
      onFilesChange(newFiles);
      setComputerFiles(jobDetails.source_files || []);

      toast({
        title: "Files uploaded successfully",
        description: `${newFiles.length} file(s) uploaded and ready for processing`,
      });

    } catch (error) {
      console.error('Failed to fetch updated job details:', error);
    } finally {
      setUploading(false);
      setUploadProgress({});
      
      // Close SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    if (e.dataTransfer.files) {
      handleComputerFileUpload(e.dataTransfer.files);
    }
  }, [jobId, uploading]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  // Handle Google Drive file selection
  const handleDriveFiles = useCallback((files: any[]) => {
    const newFiles: UploadedFile[] = files.map(file => ({
      id: `drive-${file.id}`,
      name: file.name,
      size: file.size || 0,
      type: file.mimeType,
      source: 'drive',
      externalId: file.id
    }));

    const updatedFiles = [...uploadedFiles, ...newFiles];
    setUploadedFiles(updatedFiles);
    onFilesChange(updatedFiles);
    
    // Mark that imports have been triggered
    if (files.length > 0) {
      setHasTriggeredImports(true);
    }
  }, [uploadedFiles, onFilesChange]);

  // Handle Gmail attachment selection
  const handleGmailAttachments = useCallback((attachments: any[]) => {
    const newFiles: UploadedFile[] = attachments.map(attachment => ({
      id: `gmail-${attachment.messageId}-${attachment.id}`,
      name: attachment.filename,
      size: attachment.size,
      type: attachment.mimeType,
      source: 'gmail',
      externalId: attachment.id,
      messageId: attachment.messageId,
      subject: attachment.subject,
      from: attachment.from
    }));

    const updatedFiles = [...uploadedFiles, ...newFiles];
    setUploadedFiles(updatedFiles);
    onFilesChange(updatedFiles);
    
    // Mark that imports have been triggered
    if (attachments.length > 0) {
      setHasTriggeredImports(true);
    }
  }, [uploadedFiles, onFilesChange]);

  // Remove a file
  const handleRemoveFile = useCallback((fileId: string) => {
    const updatedFiles = uploadedFiles.filter(file => file.id !== fileId);
    setUploadedFiles(updatedFiles);
    onFilesChange(updatedFiles);
  }, [uploadedFiles, onFilesChange]);

  // Clear all files
  const handleClearAll = useCallback(() => {
    setUploadedFiles([]);
    onFilesChange([]);
  }, [onFilesChange]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'computer':
        return <HardDrive className="h-4 w-4" />;
      case 'drive':
        return <Cloud className="h-4 w-4" />;
      case 'gmail':
        return <Mail className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'computer':
        return 'Computer';
      case 'drive':
        return 'Drive';
      case 'gmail':
        return 'Gmail';
      default:
        return 'Unknown';
    }
  };

  const totalFiles = uploadedFiles.length;
  const totalSize = uploadedFiles.reduce((sum, file) => sum + file.size, 0);
  const sourceBreakdown = uploadedFiles.reduce((acc, file) => {
    acc[file.source] = (acc[file.source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Integration prompt */}
      <IntegrationPrompt />

      {/* Import status display - only shows when imports are triggered */}
      {jobId && hasTriggeredImports && (
        <ImportStatusDisplay 
          jobId={jobId}
          onComplete={() => {
            // Refresh the file list or trigger any completion actions
            // The import status will show the imported files
          }}
        />
      )}

      {/* Upload tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="computer" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Computer
          </TabsTrigger>
          <TabsTrigger value="drive" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Google Drive
          </TabsTrigger>
          <TabsTrigger value="gmail" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Gmail
          </TabsTrigger>
        </TabsList>

        <TabsContent value="computer" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload from Computer
              </CardTitle>
              <CardDescription>
                Select files or folders from your computer to upload
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload Area */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                  dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25",
                  uploading ? "opacity-50 pointer-events-none" : "cursor-pointer hover:border-primary/50"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <div className="space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Uploading files...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Drop files here or click to browse</p>
                      <p className="text-xs text-muted-foreground">
                        Supports PDF files, folders, and ZIP archives
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Upload Progress */}
              {Object.keys(uploadProgress).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Upload Progress</h4>
                  {Object.entries(uploadProgress).map(([filename, progress]) => (
                    <div key={filename} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="truncate">{filename}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-1" />
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2"
                >
                  <Folder className="h-4 w-4" />
                  Add Folder
                </Button>
              </div>

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={acceptedTypes.join(',')}
                className="hidden"
                onChange={(e) => e.target.files && handleComputerFileUpload(e.target.files)}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                // @ts-ignore - webkitdirectory is not in the types but is supported
                webkitdirectory=""
                className="hidden"
                onChange={(e) => e.target.files && handleComputerFileUpload(e.target.files)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drive" className="mt-6">
          <GoogleDrivePicker
            onFilesSelected={handleDriveFiles}
            jobId={jobId}
            multiSelect
            allowFolders
            mimeTypes={acceptedTypes}
          />
        </TabsContent>

        <TabsContent value="gmail" className="mt-6">
          <GmailPicker
            onAttachmentsSelected={handleGmailAttachments}
            jobId={jobId}
            multiSelect
            mimeTypes={acceptedTypes}
          />
        </TabsContent>
      </Tabs>

      {/* File summary */}
      {totalFiles > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Selected Files</CardTitle>
                <CardDescription>
                  {totalFiles} file{totalFiles !== 1 ? 's' : ''} • {formatFileSize(totalSize)} total
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Source breakdown */}
            <div className="flex gap-2 flex-wrap">
              {Object.entries(sourceBreakdown).map(([source, count]) => (
                <Badge key={source} variant="secondary" className="flex items-center gap-1">
                  {getSourceIcon(source)}
                  {getSourceLabel(source)}: {count}
                </Badge>
              ))}
            </div>

            <Separator />

            {/* File list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {getSourceIcon(file.source)}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {file.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)} • {getSourceLabel(file.source)}
                        {file.source === 'gmail' && file.subject && (
                          <span className="ml-2">from "{file.subject}"</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFile(file.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Limits warning */}
            {totalFiles >= maxFiles && (
              <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                You've reached the maximum of {maxFiles} files. Remove some files to add more.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {totalFiles === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="flex justify-center gap-2 mb-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
                <Mail className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No files selected</h3>
              <p className="text-muted-foreground mb-4">
                Choose files from your computer, Google Drive, or Gmail attachments using the tabs above.
              </p>
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('computer')}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Files
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('drive')}
                >
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Browse Drive
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveTab('gmail')}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Gmail Attachments
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
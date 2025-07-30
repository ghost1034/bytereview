/**
 * Multi-source file upload component
 * Combines computer uploads, Google Drive, and Gmail attachments
 */
'use client';

import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Upload, 
  FolderOpen, 
  Mail, 
  X, 
  FileText, 
  Paperclip,
  HardDrive,
  Cloud,
  Trash2
} from 'lucide-react';
import { EnhancedFileUpload } from '@/components/upload/EnhancedFileUpload';
import { GoogleDrivePicker } from '@/components/integrations/GoogleDrivePicker';
import { GmailPicker } from '@/components/integrations/GmailPicker';
import { IntegrationPrompt } from '@/components/integrations/IntegrationBanner';
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
  acceptedTypes?: string[];
  maxFiles?: number;
  className?: string;
}

export function MultiSourceFileUpload({
  onFilesChange,
  acceptedTypes = ['application/pdf'],
  maxFiles = 100,
  className
}: MultiSourceFileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [activeTab, setActiveTab] = useState('computer');

  // Handle computer file uploads
  const handleComputerFiles = useCallback((files: File[]) => {
    const newFiles: UploadedFile[] = files.map(file => ({
      id: `computer-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      source: 'computer',
      path: file.webkitRelativePath || file.name
    }));

    const updatedFiles = [...uploadedFiles, ...newFiles];
    setUploadedFiles(updatedFiles);
    onFilesChange(updatedFiles);
  }, [uploadedFiles, onFilesChange]);

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
          <EnhancedFileUpload
            onFilesSelected={handleComputerFiles}
            acceptedTypes={acceptedTypes}
            maxFiles={maxFiles - totalFiles}
            multiple
            allowFolders
          />
        </TabsContent>

        <TabsContent value="drive" className="mt-6">
          <GoogleDrivePicker
            onFilesSelected={handleDriveFiles}
            multiSelect
            allowFolders
            mimeTypes={acceptedTypes}
          />
        </TabsContent>

        <TabsContent value="gmail" className="mt-6">
          <GmailPicker
            onAttachmentsSelected={handleGmailAttachments}
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
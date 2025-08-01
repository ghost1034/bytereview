/**
 * Example component showing how to integrate the import polling system
 * with the job upload workflow. This demonstrates the complete flow.
 */
'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, CheckCircle, Upload } from 'lucide-react';
import { MultiSourceFileUpload, UploadedFile } from '@/components/upload/MultiSourceFileUpload';
import { useJobWorkflowWithImports } from '@/hooks/useJobWorkflowWithImports';
import { toast } from '@/hooks/use-toast';

interface JobUploadWithPollingProps {
  jobId: string;
  onStepComplete?: (step: string) => void;
}

export function JobUploadWithPolling({
  jobId,
  onStepComplete
}: JobUploadWithPollingProps) {
  const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);

  const {
    job,
    currentStep,
    canAdvanceToStep,
    goToStep,
    isLoading,
    importProgress,
    shouldShowImportStatus,
    hasActiveImports,
    hasCompletedImports,
    totalFiles,
    enhancedProgress
  } = useJobWorkflowWithImports(jobId, {
    autoAdvanceOnImportComplete: false, // Manual control for this example
    onImportComplete: () => {
      toast({
        title: "Import Complete!",
        description: "All files have been imported successfully. You can now proceed to configure fields.",
        variant: "default"
      });
    },
    onImportError: (error) => {
      console.error('Import error:', error);
    }
  });

  const handleFilesChange = (files: UploadedFile[]) => {
    setSelectedFiles(files);
  };

  const handleProceedToFields = () => {
    if (canAdvanceToStep('fields')) {
      goToStep('fields');
      onStepComplete?.('upload');
    }
  };

  const canProceed = () => {
    // Can proceed if we have completed imports, uploaded files, or no active imports blocking
    return totalFiles > 0 && !hasActiveImports;
  };

  const getStepStatus = () => {
    if (hasActiveImports) {
      return {
        variant: 'secondary' as const,
        label: 'Importing...',
        description: `${importProgress.completed}/${importProgress.total} files imported`
      };
    }
    
    if (hasCompletedImports || selectedFiles.length > 0) {
      return {
        variant: 'default' as const,
        label: 'Ready',
        description: `${totalFiles} files ready for processing`
      };
    }
    
    return {
      variant: 'outline' as const,
      label: 'Waiting',
      description: 'Select files to continue'
    };
  };

  const stepStatus = getStepStatus();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p>Loading job details...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Files
              </CardTitle>
              <CardDescription>
                Add files from your computer, Google Drive, or Gmail attachments
              </CardDescription>
            </div>
            <Badge variant={stepStatus.variant}>
              {stepStatus.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {stepStatus.description}
          </div>
        </CardContent>
      </Card>

      {/* File Upload Interface */}
      <MultiSourceFileUpload
        jobId={jobId}
        onFilesChange={handleFilesChange}
        acceptedTypes={['application/pdf']}
        maxFiles={100}
      />

      {/* Progress Summary */}
      {(selectedFiles.length > 0 || shouldShowImportStatus) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">File Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{selectedFiles.length}</div>
                <div className="text-sm text-muted-foreground">Selected</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{importProgress.completed}</div>
                <div className="text-sm text-muted-foreground">Imported</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{totalFiles}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
            </div>

            {hasActiveImports && (
              <>
                <Separator />
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">
                    Import Progress: {importProgress.percentage}%
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${importProgress.percentage}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {canProceed() ? (
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Ready to configure extraction fields
                </span>
              ) : hasActiveImports ? (
                "Please wait for imports to complete..."
              ) : (
                "Select files to continue"
              )}
            </div>
            <Button
              onClick={handleProceedToFields}
              disabled={!canProceed()}
              className="flex items-center gap-2"
            >
              Configure Fields
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Debug Info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">Debug Info</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-2">
            <div>Current Step: {currentStep}</div>
            <div>Can Advance: {canAdvanceToStep('fields') ? 'Yes' : 'No'}</div>
            <div>Has Active Imports: {hasActiveImports ? 'Yes' : 'No'}</div>
            <div>Import Progress: {importProgress.completed}/{importProgress.total}</div>
            <div>Selected Files: {selectedFiles.length}</div>
            <div>Total Files: {totalFiles}</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default JobUploadWithPolling;
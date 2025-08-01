/**
 * Enhanced job workflow hook that integrates with the import system
 * Extends the existing useJobWorkflow with import status monitoring
 */
import { useCallback, useEffect } from 'react';
import { useJobWorkflow } from '@/hooks/useJobWorkflow';
import { useImportPoll } from '@/hooks/useOperationPoll';
import { toast } from '@/hooks/use-toast';

export interface UseJobWorkflowWithImportsOptions {
  onImportComplete?: () => void;
  onImportError?: (error: Error) => void;
  autoAdvanceOnImportComplete?: boolean; // Auto-advance to next step when imports complete
}

export function useJobWorkflowWithImports(
  jobId: string | undefined,
  options: UseJobWorkflowWithImportsOptions = {}
) {
  const {
    onImportComplete,
    onImportError,
    autoAdvanceOnImportComplete = false
  } = options;

  // Get the base job workflow
  const jobWorkflow = useJobWorkflow(jobId);

  // Monitor import status if we have a job ID
  const importPoll = useImportPoll(jobId || '', {
    enabled: !!jobId,
    onComplete: (status) => {
      toast({
        title: "Files Imported",
        description: `Successfully imported ${status.total_files} files`,
        variant: "default"
      });
      
      onImportComplete?.();
      
      // Auto-advance to fields step if enabled and we're on upload step
      if (autoAdvanceOnImportComplete && jobWorkflow.currentStep === 'upload') {
        jobWorkflow.goToStep('fields');
      }
    },
    onError: (error) => {
      toast({
        title: "Import Error",
        description: "There was an issue importing files",
        variant: "destructive"
      });
      onImportError?.(error);
    }
  });

  // Enhanced step validation that considers import status
  const canAdvanceToStep = useCallback((step: string) => {
    const baseCanAdvance = jobWorkflow.canAdvanceToStep(step);
    
    // If advancing from upload to fields, check if we have files (either uploaded or imported)
    if (jobWorkflow.currentStep === 'upload' && step === 'fields') {
      const hasImportedFiles = importPoll.progress.completed > 0;
      const hasUploadedFiles = jobWorkflow.job?.source_files?.length > 0;
      const hasActiveImports = importPoll.progress.pending > 0;
      
      // Allow advancement if we have completed imports, uploaded files, or active imports
      return baseCanAdvance && (hasImportedFiles || hasUploadedFiles || hasActiveImports);
    }
    
    return baseCanAdvance;
  }, [jobWorkflow, importPoll.progress]);

  // Enhanced step advancement with import awareness
  const goToStepWithImportCheck = useCallback((step: string) => {
    if (canAdvanceToStep(step)) {
      jobWorkflow.goToStep(step);
    } else {
      // Provide helpful feedback about why advancement is blocked
      if (jobWorkflow.currentStep === 'upload' && step === 'fields') {
        if (importPoll.progress.pending > 0) {
          toast({
            title: "Import In Progress",
            description: "Please wait for file imports to complete before proceeding",
            variant: "default"
          });
        } else if (importPoll.progress.total === 0 && (!jobWorkflow.job?.source_files?.length)) {
          toast({
            title: "No Files Selected",
            description: "Please upload or import files before proceeding",
            variant: "destructive"
          });
        }
      }
    }
  }, [canAdvanceToStep, jobWorkflow, importPoll.progress]);

  // Check if we should show import status
  const shouldShowImportStatus = importPoll.progress.total > 0 || importPoll.isLoading;

  // Combined loading state
  const isLoading = jobWorkflow.isLoading || importPoll.isLoading;

  // Combined error state
  const hasError = !!jobWorkflow.error || !!importPoll.error;

  // Enhanced progress calculation that includes import progress
  const enhancedProgress = useCallback(() => {
    const baseProgress = jobWorkflow.progress;
    
    // If we're on the upload step and have active imports, factor in import progress
    if (jobWorkflow.currentStep === 'upload' && importPoll.progress.total > 0) {
      const importProgress = importPoll.progress.percentage;
      // Weight the import progress as part of the upload step
      return {
        ...baseProgress,
        uploadProgress: importProgress,
        description: importPoll.progress.pending > 0 
          ? `Importing files... ${importPoll.progress.completed}/${importPoll.progress.total} complete`
          : baseProgress.description
      };
    }
    
    return baseProgress;
  }, [jobWorkflow, importPoll.progress]);

  return {
    // All original job workflow properties and methods
    ...jobWorkflow,
    
    // Enhanced methods
    canAdvanceToStep,
    goToStep: goToStepWithImportCheck,
    
    // Import-specific properties
    importStatus: importPoll.status,
    importProgress: importPoll.progress,
    isImportPolling: importPoll.isPolling,
    startImportPolling: importPoll.startPolling,
    stopImportPolling: importPoll.stopPolling,
    refreshImportStatus: importPoll.refetch,
    
    // Enhanced combined properties
    isLoading,
    hasError,
    shouldShowImportStatus,
    enhancedProgress: enhancedProgress(),
    
    // Utility methods
    hasActiveImports: importPoll.progress.pending > 0,
    hasCompletedImports: importPoll.progress.completed > 0,
    hasFailedImports: importPoll.progress.failed > 0,
    totalFiles: (jobWorkflow.job?.source_files?.length || 0) + importPoll.progress.total
  };
}

// Type for the enhanced workflow result
export type JobWorkflowWithImports = ReturnType<typeof useJobWorkflowWithImports>;
/**
 * Hook for polling operation status with automatic updates
 * Supports import operations, extraction tasks, and other long-running operations
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export interface OperationStatus {
  total_files: number;
  by_source: Record<string, number>;
  by_status: Record<string, number>;
  files: Array<{
    id: string;
    filename: string;
    source_type: string;
    status: string;
    file_size: number;
    updated_at: string | null;
  }>;
}

export interface UseOperationPollOptions {
  enabled?: boolean;
  pollInterval?: number; // milliseconds
  stopWhenComplete?: boolean;
  onStatusChange?: (status: OperationStatus) => void;
  onComplete?: (status: OperationStatus) => void;
  onError?: (error: Error) => void;
}

export interface UseOperationPollResult {
  status: OperationStatus | undefined;
  isLoading: boolean;
  error: Error | null;
  isPolling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
  refetch: () => void;
  progress: {
    completed: number;
    failed: number;
    pending: number;
    total: number;
    percentage: number;
    isComplete: boolean;
    hasErrors: boolean;
  };
}

export function useOperationPoll(
  jobId: string,
  options: UseOperationPollOptions = {}
): UseOperationPollResult {
  const {
    enabled = true,
    pollInterval = 2000, // 2 seconds default
    stopWhenComplete = true,
    onStatusChange,
    onComplete,
    onError
  } = options;

  const [isPolling, setIsPolling] = useState(false);
  const queryClient = useQueryClient();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousStatusRef = useRef<OperationStatus | null>(null);

  // Query for import status
  const {
    data: status,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['import-status', jobId],
    queryFn: async (): Promise<OperationStatus> => {
      return await apiClient.getImportStatus(jobId);
    },
    enabled: enabled && !!jobId,
    staleTime: 1000, // Consider data stale after 1 second
    retry: (failureCount, error: any) => {
      // Retry on network errors, but not on 404 or auth errors
      if (error?.status === 404 || error?.status === 403) {
        return false;
      }
      return failureCount < 3;
    },
    // Only refetch if we have actual imports to monitor
    refetchInterval: false // Disable automatic refetching, we'll handle it manually
  });

  // Calculate progress metrics (memoized to prevent infinite loops)
  const currentProgress = useMemo(() => {
    if (!status) {
      return {
        completed: 0,
        failed: 0,
        pending: 0,
        total: 0,
        percentage: 0,
        isComplete: false,
        hasErrors: false
      };
    }

    const completed = status.by_status?.completed || 0;
    const failed = status.by_status?.failed || 0;
    const importing = status.by_status?.importing || 0;
    const uploading = status.by_status?.uploading || 0;
    const pending = importing + uploading;
    const total = status.total_files;

    const percentage = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;
    const isComplete = total > 0 && (completed + failed) >= total;
    const hasErrors = failed > 0;

    return {
      completed,
      failed,
      pending,
      total,
      percentage,
      isComplete,
      hasErrors
    };
  }, [status?.total_files, status?.by_status]);

  // Helper function for calculating progress of any status
  const progress = useCallback((currentStatus: OperationStatus | undefined) => {
    if (!currentStatus) {
      return {
        completed: 0,
        failed: 0,
        pending: 0,
        total: 0,
        percentage: 0,
        isComplete: false,
        hasErrors: false
      };
    }

    const completed = currentStatus.by_status?.completed || 0;
    const failed = currentStatus.by_status?.failed || 0;
    const importing = currentStatus.by_status?.importing || 0;
    const uploading = currentStatus.by_status?.uploading || 0;
    const pending = importing + uploading;
    const total = currentStatus.total_files;

    const percentage = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;
    const isComplete = total > 0 && (completed + failed) >= total;
    const hasErrors = failed > 0;

    return {
      completed,
      failed,
      pending,
      total,
      percentage,
      isComplete,
      hasErrors
    };
  }, []);

  // Start polling
  const startPolling = useCallback(() => {
    if (intervalRef.current || !enabled) return;

    setIsPolling(true);
    intervalRef.current = setInterval(() => {
      refetch();
    }, pollInterval);
  }, [enabled, pollInterval, refetch]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Handle status changes
  useEffect(() => {
    if (!status) return;

    const currentProgress = progress(status);
    const previousStatus = previousStatusRef.current;
    
    // Call status change callback if status has changed
    if (onStatusChange && JSON.stringify(status) !== JSON.stringify(previousStatus)) {
      onStatusChange(status);
    }

    // Call completion callback if operation is complete (and wasn't complete before)
    if (onComplete && currentProgress.isComplete && (!previousStatus || !progress(previousStatus).isComplete)) {
      onComplete(status);
    }

    // Auto-stop polling when complete
    if (stopWhenComplete && currentProgress.isComplete && isPolling) {
      stopPolling();
    }

    previousStatusRef.current = status;
  }, [status?.total_files, status?.by_status, onStatusChange, onComplete, stopWhenComplete]); // More specific dependencies

  // Handle errors
  useEffect(() => {
    if (error && onError) {
      onError(error as Error);
    }
  }, [error, onError]);

  // Auto-start polling when enabled (only when there are files to monitor)
  useEffect(() => {
    if (enabled && !isPolling && status && status.total_files > 0 && !currentProgress.isComplete) {
      startPolling();
    }
  }, [enabled, status?.total_files, currentProgress.isComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    isLoading,
    error: error as Error | null,
    isPolling,
    startPolling,
    stopPolling,
    refetch,
    progress: currentProgress
  };
}

// Specialized hook for import operations
export function useImportPoll(
  jobId: string,
  options: UseOperationPollOptions = {}
) {
  return useOperationPoll(jobId, {
    pollInterval: 2000,
    stopWhenComplete: true,
    enabled: options.enabled !== false, // Let the caller control when to enable
    ...options
  });
}

// Hook for monitoring multiple operations
export function useMultiOperationPoll(
  jobIds: string[],
  options: UseOperationPollOptions = {}
) {
  const results = jobIds.map(jobId => 
    useOperationPoll(jobId, { ...options, enabled: options.enabled && !!jobId })
  );

  const combinedProgress = {
    completed: results.reduce((sum, result) => sum + result.progress.completed, 0),
    failed: results.reduce((sum, result) => sum + result.progress.failed, 0),
    pending: results.reduce((sum, result) => sum + result.progress.pending, 0),
    total: results.reduce((sum, result) => sum + result.progress.total, 0),
    percentage: 0,
    isComplete: results.every(result => result.progress.isComplete),
    hasErrors: results.some(result => result.progress.hasErrors)
  };

  combinedProgress.percentage = combinedProgress.total > 0 
    ? Math.round(((combinedProgress.completed + combinedProgress.failed) / combinedProgress.total) * 100)
    : 0;

  return {
    results,
    combinedProgress,
    isAnyLoading: results.some(result => result.isLoading),
    isAnyPolling: results.some(result => result.isPolling),
    hasAnyError: results.some(result => result.error),
    startAll: () => results.forEach(result => result.startPolling()),
    stopAll: () => results.forEach(result => result.stopPolling()),
    refetchAll: () => results.forEach(result => result.refetch())
  };
}
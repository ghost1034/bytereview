"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient, JobRunListResponse, JobRunListItem } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface UseJobRunSelectionOptions {
  jobId: string;
  enabled?: boolean;
  onRunChange?: (runId: string, run: JobRunListItem | undefined) => void;
}

export function useJobRunSelection({ 
  jobId, 
  enabled = true,
  onRunChange 
}: UseJobRunSelectionOptions) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Fetch job runs
  const { 
    data: runsData, 
    isLoading: runsLoading, 
    error: runsError,
    refetch: refetchRuns
  } = useQuery({
    queryKey: ['job-runs', jobId],
    queryFn: async (): Promise<JobRunListResponse> => {
      if (!user) throw new Error('User not authenticated');
      return apiClient.getJobRuns(jobId);
    },
    enabled: enabled && !!user && !!jobId,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  const runs = runsData?.runs || [];
  const latestRunId = runsData?.latest_run_id || '';

  // Get selected run ID from URL or default to latest
  const urlRunId = searchParams.get('run_id');
  const selectedRunId = urlRunId || latestRunId;

  // Find the selected run object
  const selectedRun = runs.find(run => run.id === selectedRunId);

  // Check if the selected run is read-only
  const isReadOnly = selectedRun ? 
    ['completed', 'in_progress'].includes(selectedRun.status) || 
    selectedRun.config_step === 'submitted' : false;

  // Update URL when run selection changes
  const setSelectedRunId = useCallback((runId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('run_id', runId);
    
    const currentPath = window.location.pathname;
    router.push(`${currentPath}?${params.toString()}`, { scroll: false });
    
    // Find the run and call callback
    const run = runs.find(r => r.id === runId);
    onRunChange?.(runId, run);
  }, [router, searchParams, runs, onRunChange]);

  // Redirect to latest run if URL has invalid run_id
  useEffect(() => {
    if (runs.length > 0 && latestRunId && urlRunId && !selectedRun) {
      console.warn(`Invalid run_id ${urlRunId}, redirecting to latest: ${latestRunId}`);
      setSelectedRunId(latestRunId);
    }
  }, [runs, latestRunId, urlRunId, selectedRun, setSelectedRunId]);

  // Set default run_id if missing from URL
  useEffect(() => {
    if (runs.length > 0 && latestRunId && !urlRunId) {
      // Set the latest run ID in URL for explicit selection
      setSelectedRunId(latestRunId);
    }
  }, [runs, latestRunId, urlRunId, setSelectedRunId]);

  // Create a new run
  const createNewRun = useCallback(async (options?: { 
    cloneFromRunId?: string; 
    templateId?: string;
    redirectTo?: 'upload' | 'fields';
  }) => {
    if (!user) throw new Error('User not authenticated');
    
    const response = await apiClient.createJobRun(jobId, {
      clone_from_run_id: options?.cloneFromRunId || selectedRunId,
      template_id: options?.templateId
    });
    
    // Refetch runs to get the new run
    await refetchRuns();
    
    // Navigate to the new run
    const redirectStep = options?.redirectTo || 'upload';
    const newRunId = response.job_run_id;
    
    router.push(`/dashboard/jobs/${jobId}/${redirectStep}?run_id=${newRunId}`);
    
    return response;
  }, [user, jobId, selectedRunId, refetchRuns, router]);

  return {
    // Run data
    runs,
    latestRunId,
    selectedRunId,
    selectedRun,
    
    // State
    isLoading: runsLoading,
    error: runsError,
    isReadOnly,
    
    // Actions
    setSelectedRunId,
    createNewRun,
    refetchRuns,
    
    // Computed state
    hasMultipleRuns: runs.length > 1,
    isLatestSelected: selectedRunId === latestRunId,
    
    // Validation helpers
    canEdit: !isReadOnly,
    canCreateNewRun: true, // Always allow creating new runs
    
    // Status helpers
    isCompleted: selectedRun?.status === 'completed',
    isInProgress: selectedRun?.status === 'in_progress',
    isPending: selectedRun?.status === 'pending',
    isFailed: selectedRun?.status === 'failed'
  };
}
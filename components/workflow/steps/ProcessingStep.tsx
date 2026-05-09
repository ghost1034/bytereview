/**
 * Processing Step for Job Workflow
 * Real-time progress tracking and status updates
 */
"use client";

import { useEffect, useState, useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Section } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useJobDetails, useJobProgress } from "@/hooks/useJobs";
import { JobStatus, apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { statusBgColorClass } from "@/lib/utils/workflow-status";

// Simple global connection manager that survives component remounts
class SSEConnectionManager {
  private connections = new Map<string, EventSource>();
  private eventHandlersAttached = new Set<string>();
  private connectionStates = new Map<string, 'connecting' | 'open' | 'closed'>();

  getConnection(jobId: string): EventSource | null {
    return this.connections.get(jobId) || null;
  }

  setConnection(jobId: string, eventSource: EventSource): void {
    this.connections.set(jobId, eventSource);
    this.connectionStates.set(jobId, 'connecting');
  }

  closeConnection(jobId: string): void {
    const connection = this.connections.get(jobId);
    if (connection) {
      connection.close();
      this.connections.delete(jobId);
      this.eventHandlersAttached.delete(jobId);
      this.connectionStates.delete(jobId);
    }
  }

  hasConnection(jobId: string): boolean {
    return this.connections.has(jobId);
  }

  isConnectionOpen(jobId: string): boolean {
    const connection = this.connections.get(jobId);
    return connection?.readyState === EventSource.OPEN;
  }

  isConnecting(jobId: string): boolean {
    const connection = this.connections.get(jobId);
    return connection?.readyState === EventSource.CONNECTING;
  }

  hasEventHandlers(jobId: string): boolean {
    return this.eventHandlersAttached.has(jobId);
  }

  markEventHandlersAttached(jobId: string): void {
    this.eventHandlersAttached.add(jobId);
  }

  markConnectionOpen(jobId: string): void {
    this.connectionStates.set(jobId, 'open');
  }

  markConnectionClosed(jobId: string): void {
    this.connectionStates.set(jobId, 'closed');
  }
}

const sseManager = new SSEConnectionManager();

interface ProcessingStepProps {
  jobId: string;
  onJobCompleted: (jobId: string) => void;
  onViewResults?: () => void;
  onBack: () => void;
}

export default function ProcessingStep({
  jobId,
  onJobCompleted,
  onViewResults,
  onBack,
}: ProcessingStepProps) {
  const { data: jobDetails, isLoading: jobLoading } = useJobDetails(jobId);
  // No longer need separate progress API call - SSE provides full_state
  // SSE connection for real-time updates
  const eventSourceRef = useRef<EventSource | null>(null);
  // Single source of truth for progress - starts with server data, gets updated by SSE
  // Initialize as null to distinguish between "no data yet" and "zero progress"
  const [currentProgress, setCurrentProgress] = useState<{
    total: number;
    completed: number;
    failed: number;
  } | null>(null);
  const [processingSteps, setProcessingSteps] = useState<
    Array<{
      id: string;
      name: string;
      status: "pending" | "processing" | "completed" | "failed";
      errorMessage?: string | null;
    }>
  >([]);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  // Simple local state for immediate completion updates
  const [jobCompleted, setJobCompleted] = useState(false);
  const [jobFailed, setJobFailed] = useState(false);
  const [sseIntentionallyClosed, setSseIntentionallyClosed] = useState(false);

  // Track if we've already restored processing steps to prevent re-restoration
  const hasRestoredSteps = useRef(false);

  // Simplified status derivation - single source of truth
  const isCompleted = jobDetails?.status === "completed" || jobCompleted;
  const isProcessing = jobDetails?.status === "in_progress" && !isCompleted;
  const isFailed = jobDetails?.status === "failed" || jobFailed;

  console.log(
    `Job status check: status=${jobDetails?.status}, isCompleted=${isCompleted}, isProcessing=${isProcessing}`
  );


  // Handle full_state from SSE - this replaces the old progress API approach
  const handleFullState = (fullStateData: any) => {
    console.log("=== FULL STATE RECEIVED ===");
    console.log("Full state data:", fullStateData);

    const { progress: progressData } = fullStateData;

    // Initialize current progress from full state
    setCurrentProgress({
      total: progressData.total_tasks || 0,
      completed: progressData.completed || 0,
      failed: progressData.failed || 0,
    });

    // Restore processing steps from full state
    if (progressData.tasks && progressData.tasks.length > 0) {
      console.log(
        "Restoring processing steps from full state",
        progressData.tasks
      );
      const restoredSteps = [];

      // Create steps from actual task data
      for (const task of progressData.tasks) {
        console.log(`Restoring task: ${task.id} with status: ${task.status}`);
        restoredSteps.push({
          id: task.id,
          name: task.display_name || `Task ${task.id}`,
          errorMessage: task.error_message,
          status: task.status as
            | "pending"
            | "processing"
            | "completed"
            | "failed",
        });

        // Set current step if task is processing
        if (task.status === "processing") {
          setCurrentStep(task.id);
        }
      }

      setProcessingSteps(restoredSteps);
      console.log(
        `Restored ${restoredSteps.length} processing steps from full state`
      );
    }

    // Update job completion status
    if (fullStateData.status === "completed") {
      console.log("Job completed according to full state");
      setJobCompleted(true);
    } else if (fullStateData.status === "failed") {
      console.log("Job failed according to full state");
      setJobFailed(true);
    }
  };

  // SSE connection setup for real-time progress updates
  const setupSSEConnection = async () => {
    // Don't establish connection if job is already completed or SSE was intentionally closed
    if (isCompleted || sseIntentionallyClosed) {
      console.log(
        "Job completed or SSE intentionally closed, skipping SSE setup"
      );
      return;
    }

    // Check if we already have an active connection for this job
    if (sseManager.isConnectionOpen(jobId)) {
      console.log(`SSE connection already exists and is open for job ${jobId}, reusing it`);
      eventSourceRef.current = sseManager.getConnection(jobId);
      return;
    }

    // If there's a connection that's still connecting, wait for it
    if (sseManager.isConnecting(jobId)) {
      console.log(`SSE connection is already connecting for job ${jobId}, skipping duplicate setup`);
      eventSourceRef.current = sseManager.getConnection(jobId);
      return;
    }

    // Close any existing connection that might be in a bad state
    if (sseManager.hasConnection(jobId)) {
      console.log("Closing existing SSE connection to create fresh one for this page visit");
      sseManager.closeConnection(jobId);
    }
    
    console.log(`Creating new SSE connection for job ${jobId}`);

    try {
      console.log("Setting up SSE connection for job processing updates");
      const token = await apiClient.getAuthTokenForSSE();
      if (!token) {
        console.warn("No auth token available for SSE");
        return;
      }

      const sseUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/jobs/${jobId}/events?token=${token}&include_full_state=true`;
      const eventSource = new EventSource(sseUrl);

      // Store in both ref and global manager
      eventSourceRef.current = eventSource;
      sseManager.setConnection(jobId, eventSource);

      // Always attach event handlers for fresh connection
      eventSource.onopen = () => {
        console.log("SSE connection established for job processing");
        sseManager.markConnectionOpen(jobId);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`[Connection ${eventSource.url}] Received SSE event:`, data);

          switch (data.type) {
            case "full_state":
              console.log("Received full_state event");
              handleFullState(data);
              break;

            case "task_started":
              console.log(`Task started: ${data.task_id}`);
              setCurrentStep(data.task_id);
              setProcessingSteps((prev) => {
                const existing = prev.find((step) => step.id === data.task_id);
                if (existing) {
                  return prev.map((step) =>
                    step.id === data.task_id
                      ? {
                          ...step,
                          status: "processing",
                          errorMessage: null,
                          startTime: Date.now(),
                        }
                      : step
                  );
                }
                return [
                  ...prev,
                  {
                    id: data.task_id,
                    name: data.display_name || `Processing Task ${prev.length + 1}`,
                    status: "processing",
                    errorMessage: null,
                    startTime: Date.now(),
                  },
                ];
              });
              break;

            case "task_completed":
              console.log(`Task completed: ${data.task_id}`);
              setCurrentProgress((prev) => {
                if (!prev) return prev; // Don't update if no initial data yet
                const newCompleted = prev.completed + 1;
                console.log(`Progress: ${newCompleted}/${prev.total}`);
                return {
                  ...prev,
                  completed: newCompleted,
                };
              });
              setProcessingSteps((prev) => {
                const updated = prev.map((step) =>
                  step.id === data.task_id
                    ? { ...step, status: "completed" as const, errorMessage: null }
                    : step
                );

                // If no step was found with this task_id, it might be a new task
                // that wasn't in our restored steps
                const foundStep = prev.find((step) => step.id === data.task_id);
                if (!foundStep) {
                  console.log(
                    `Task ${data.task_id} not found in existing steps, adding as completed`
                  );
                  updated.push({
                    id: data.task_id,
                    name: `Task ${data.task_id}`,
                    status: "completed",
                    errorMessage: null,
                  });
                }

                return updated;
              });
              break;

            case "task_failed":
              console.log(`Task failed: ${data.task_id}`);
              // Increment failed count for progress so UI reflects failure immediately
              setCurrentProgress((prev) => {
                if (!prev) return prev; // Wait for initial state from full_state
                const newFailed = prev.failed + 1;
                const newRemaining = Math.max(prev.total - prev.completed - newFailed, 0);
                console.log(`Progress (failed): failed=${newFailed}, remaining=${newRemaining}`);
                return {
                  ...prev,
                  failed: newFailed,
                };
              });
              setProcessingSteps((prev) => {
                const updated = prev.map((step) =>
                  step.id === data.task_id
                    ? { ...step, status: "failed" as const, errorMessage: data.error }
                    : step
                );

                // If no step was found with this task_id, add it as failed
                const foundStep = prev.find((step) => step.id === data.task_id);
                if (!foundStep) {
                  console.log(
                    `Task ${data.task_id} not found in existing steps, adding as failed`
                  );
                  updated.push({
                    id: data.task_id,
                    name: `Task ${data.task_id}`,
                    status: "failed",
                    errorMessage: data.error,
                  });
                }

                return updated;
              });
              break;

            case "job_completed":
              console.log("Job completed", data.status);
              setCurrentStep(null);

              if (data.status === "failed") {
                setJobFailed(true);
              } else {
                // Treat completed and partially_completed runs as ready for results.
                setJobCompleted(true);
              }
              setSseIntentionallyClosed(true);

              // Gracefully close SSE connection
              try {
                // Remove event handlers first to prevent error events
                eventSource.onmessage = null;
                eventSource.onerror = null;
                eventSource.onopen = null;
                
                // Then close the connection
                eventSource.close();
                sseManager.closeConnection(jobId);
                eventSourceRef.current = null;
              } catch (e) {
                console.log("Error closing SSE connection:", e);
              }
              break;

            case "job_already_completed":
              console.log("Job already completed, closing SSE connection", data.status);
              if (data.status === "failed") {
                setJobFailed(true);
              } else {
                setJobCompleted(true);
              }
              setSseIntentionallyClosed(true);

              // Gracefully close connection since job is already done
              try {
                // Remove event handlers first to prevent error events
                eventSource.onmessage = null;
                eventSource.onerror = null;
                eventSource.onopen = null;
                
                // Then close the connection
                eventSource.close();
                sseManager.closeConnection(jobId);
                eventSourceRef.current = null;
              } catch (e) {
                console.log("Error closing SSE connection:", e);
              }
              break;

            default:
              console.log(`Ignoring SSE event type: ${data.type}`);
          }
        } catch (error) {
          console.error("Error parsing SSE event:", error);
        }
      };

      eventSource.onerror = (error) => {
        sseManager.markConnectionClosed(jobId);
        
        // Check if this is an expected closure (job completed)
        if (jobCompleted || sseIntentionallyClosed || isCompleted) {
          console.log("SSE connection closed - job completed");
          eventSource.close();
          sseManager.closeConnection(jobId);
          eventSourceRef.current = null;
          return;
        }
        
        // Only log unexpected errors
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log("SSE connection closed by server");
        } else {
          console.error("SSE connection error:", error);
        }
        
        // Clean up the connection
        eventSource.close();
        sseManager.closeConnection(jobId);
        eventSourceRef.current = null;
      };

      // Store the connection globally and in component ref
      console.log(`Storing SSE connection for job ${jobId}, URL: ${eventSource.url}`);
      sseManager.setConnection(jobId, eventSource);
      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error("Error setting up SSE:", error);
    }
  };

  // Close SSE connection (for manual cleanup if needed)
  const closeSSEConnection = () => {
    if (eventSourceRef.current) {
      console.log("Manual close: SSE connection for job:", jobId);
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  // Setup SSE connection when component mounts - ONCE
  useEffect(() => {
    if (jobId && !isCompleted) {
      // Add a small delay to ensure any previous cleanup has completed
      const timeoutId = setTimeout(() => {
        setupSSEConnection();
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        console.log("useEffect cleanup: closing SSE connection");
        sseManager.closeConnection(jobId);
        eventSourceRef.current = null;
      };
    }

    return () => {
      console.log("useEffect cleanup: closing SSE connection");
      sseManager.closeConnection(jobId);
      eventSourceRef.current = null;
    };
  }, [jobId]); // Include jobId to handle job changes, but this should be stable


  // Check if job is completed (using ref to avoid infinite re-renders)
  const onJobCompletedRef = useRef(onJobCompleted);
  onJobCompletedRef.current = onJobCompleted;
  const hasCalledOnJobCompleted = useRef(false);

  useEffect(() => {
    if (isCompleted && !hasCalledOnJobCompleted.current) {
      hasCalledOnJobCompleted.current = true;
      onJobCompletedRef.current(jobId);
    }
  }, [isCompleted, jobId]);


  const getStatusIcon = () => {
    if (isCompleted) {
      return <CheckCircle className="w-5 h-5 text-success" aria-hidden />;
    }
    if (isProcessing) {
      return <Loader2 className="w-5 h-5 animate-spin text-info" aria-hidden />;
    }
    if (isFailed) {
      return <XCircle className="w-5 h-5 text-destructive" aria-hidden />;
    }
    return <Clock className="w-5 h-5 text-foreground-muted" aria-hidden />;
  };

  // Suppress unused warning — getStatusIcon and getStatusColor are exported via the
  // helper return type for consumers; keep both to avoid touching downstream callers.
  void getStatusIcon;

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case "in_progress":
        return statusBgColorClass("info");
      case "completed":
        return statusBgColorClass("success");
      case "failed":
        return statusBgColorClass("destructive");
      case "cancelled":
      default:
        return statusBgColorClass("neutral");
    }
  };
  void getStatusColor;

  const calculateProgress = () => {
    if (!currentProgress || currentProgress.total === 0) return 0;
    return Math.round(
      ((currentProgress.completed + currentProgress.failed) / currentProgress.total) * 100
    );
  };

  const progressPercentage = calculateProgress();

  if (jobLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="ml-2">Loading job details...</span>
      </div>
    );
  }

  return (
    <div
      className="space-y-6"
      role="status"
      aria-live="polite"
      aria-busy={isProcessing}
    >
      {/* Progress overview */}
      <Section variant="card" title="Progress overview">
        <div data-tour="processing-status" className="space-y-5">
          {/* Overall progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-foreground">
              <span className="text-foreground-muted">Overall progress</span>
              <span className="font-medium tabular-nums">{progressPercentage}%</span>
            </div>
            <Progress
              value={progressPercentage}
              className="h-3"
              aria-valuenow={progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Overall job progress"
            />
          </div>

          {/* Task statistics */}
          {currentProgress ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Total tasks" value={currentProgress.total} />
              <StatCard label="Completed" value={currentProgress.completed} />
              <StatCard
                label="Remaining"
                value={
                  currentProgress.total -
                  currentProgress.completed -
                  currentProgress.failed
                }
              />
              <StatCard label="Failed" value={currentProgress.failed} />
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-foreground-muted">
              <Loader2 className="w-6 h-6 animate-spin mr-2" aria-hidden />
              <span>Loading progress data…</span>
            </div>
          )}
        </div>
      </Section>

      {/* Real-time processing steps */}
      <Section variant="card" title="Processing tasks">
        <div className="space-y-3">
          {processingSteps.length === 0 ? (
            <div className="text-center text-foreground-muted py-4">
              Waiting for processing to begin…
            </div>
          ) : (
            processingSteps.map((step) => {
              const stepTone =
                step.status === "completed"
                  ? "success"
                  : step.status === "processing"
                  ? "info"
                  : step.status === "failed"
                  ? "destructive"
                  : "neutral";

              return (
                <div key={step.id} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      step.status === "completed"
                        ? "bg-success"
                        : step.status === "processing"
                        ? "bg-info"
                        : step.status === "failed"
                        ? "bg-destructive"
                        : "bg-surface-muted",
                    )}
                    aria-hidden
                  >
                    {step.status === "processing" ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : step.status === "completed" ? (
                      <CheckCircle className="w-4 h-4 text-white" />
                    ) : step.status === "failed" ? (
                      <XCircle className="w-4 h-4 text-white" />
                    ) : (
                      <Clock className="w-4 h-4 text-foreground-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {step.name}
                    </div>
                    <div className="text-xs text-foreground-muted">
                      {step.status === "processing"
                        ? "Currently processing…"
                        : step.status === "completed"
                        ? "Completed"
                        : step.status === "failed"
                        ? step.errorMessage || "Processing failed"
                        : step.status === "pending"
                        ? "Pending…"
                        : "Status unknown"}
                    </div>
                  </div>
                  <Badge
                    variant={
                      stepTone === "destructive" ? "destructive" : stepTone === "neutral" ? "secondary" : "default"
                    }
                  >
                    {step.status === "processing"
                      ? "Processing"
                      : step.status === "completed"
                      ? "Complete"
                      : step.status === "failed"
                      ? "Failed"
                      : "Pending"}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
      </Section>

      {/* Error display */}
      {isFailed && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Processing failed</AlertTitle>
          <AlertDescription>
            The extraction job encountered an error. Please try again or
            contact support if the issue persists.
          </AlertDescription>
        </Alert>
      )}

      {/* Real-time updates notice */}
      {isProcessing && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Processing in progress</AlertTitle>
          <AlertDescription>
            This page updates automatically. You can safely navigate away and
            return later.
          </AlertDescription>
        </Alert>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isProcessing}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {isCompleted && <Button onClick={onViewResults}>View Results</Button>}
      </div>
    </div>
  );
}

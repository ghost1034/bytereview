/**
 * Processing Step for Job Workflow
 * Real-time progress tracking and status updates
 */
"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

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
    }>
  >([]);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  // Simple local state for immediate completion updates
  const [jobCompleted, setJobCompleted] = useState(false);
  const [sseIntentionallyClosed, setSseIntentionallyClosed] = useState(false);

  // Track if we've already restored processing steps to prevent re-restoration
  const hasRestoredSteps = useRef(false);

  // Simplified status derivation - single source of truth
  const isCompleted = jobDetails?.status === "completed" || jobCompleted;
  const isProcessing = jobDetails?.status === "in_progress" && !isCompleted;
  const isFailed = jobDetails?.status === "failed";

  console.log(
    `Job status check: status=${jobDetails?.status}, isCompleted=${isCompleted}, isProcessing=${isProcessing}`
  );

  // Update elapsed time every second (stop when job completes)
  useEffect(() => {
    if (isCompleted) return; // Stop updating when job is completed

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [isCompleted, startTime]);

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
                    ? { ...step, status: "completed" }
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
                  });
                }

                return updated;
              });
              break;

            case "task_failed":
              console.log(`Task failed: ${data.task_id}`);
              setProcessingSteps((prev) => {
                const updated = prev.map((step) =>
                  step.id === data.task_id
                    ? { ...step, status: "failed" }
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
                  });
                }

                return updated;
              });
              break;

            case "job_completed":
              console.log("Job completed");
              setCurrentStep(null);

              // Mark job as completed immediately for UI updates
              setJobCompleted(true);
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
              console.log("Job already completed, closing SSE connection");
              setJobCompleted(true);
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

  const formatElapsedTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  const getStatusIcon = () => {
    if (isCompleted) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (isProcessing) {
      return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
    }
    if (isFailed) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    return <Clock className="w-5 h-5 text-gray-500" />;
  };

  const getStatusColor = (status: JobStatus) => {
    switch (status) {
      case "in_progress":
        return "bg-blue-500";
      case "completed":
        return "bg-green-500";
      case "failed":
        return "bg-red-500";
      case "cancelled":
        return "bg-gray-500";
      default:
        return "bg-gray-400";
    }
  };

  const calculateProgress = () => {
    if (!currentProgress || currentProgress.total === 0) return 0;
    return Math.round(
      (currentProgress.completed / currentProgress.total) * 100
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
    <div className="space-y-6">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Progress Overview</span>
            <div className="text-sm font-normal text-muted-foreground">
              Elapsed: {Math.floor(elapsedTime / 60000)}m{" "}
              {Math.floor((elapsedTime % 60000) / 1000)}s
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Overall Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Progress</span>
                <span>{progressPercentage}%</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>

            {/* Task Statistics */}
            {currentProgress ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-blue-600">
                    {currentProgress.total}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Tasks
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-green-600">
                    {currentProgress.completed}
                  </div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-orange-600">
                    {currentProgress.total -
                      currentProgress.completed -
                      currentProgress.failed}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Tasks Remaining
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-red-600">
                    {currentProgress.failed}
                  </div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-muted-foreground">
                  Loading progress data...
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Real-time Processing Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {processingSteps.length === 0 ? (
              <div className="text-center text-muted-foreground py-4">
                Waiting for processing to begin...
              </div>
            ) : (
              processingSteps.map((step, index) => {
                const isCurrentStep = currentStep === step.id;

                return (
                  <div key={step.id} className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        step.status === "completed"
                          ? "bg-green-500"
                          : step.status === "processing"
                          ? "bg-blue-500"
                          : step.status === "failed"
                          ? "bg-red-500"
                          : "bg-gray-300"
                      }`}
                    >
                      {step.status === "processing" ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      ) : step.status === "completed" ? (
                        <CheckCircle className="w-4 h-4 text-white" />
                      ) : step.status === "failed" ? (
                        <XCircle className="w-4 h-4 text-white" />
                      ) : (
                        <Clock className="w-4 h-4 text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{step.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {step.status === "processing"
                          ? "Currently processing..."
                          : step.status === "completed"
                          ? "Completed"
                          : step.status === "failed"
                          ? "Processing failed"
                          : step.status === "pending"
                          ? "Pending..."
                          : "Status unknown"}
                      </div>
                    </div>
                    <Badge
                      variant={
                        step.status === "completed"
                          ? "default"
                          : step.status === "processing"
                          ? "default"
                          : step.status === "failed"
                          ? "destructive"
                          : "secondary"
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
        </CardContent>
      </Card>

      {/* Error Display */}
      {isFailed && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertTriangle className="w-5 h-5" />
              <div>
                <strong>Processing Failed</strong>
                <p className="text-sm mt-1">
                  The extraction job encountered an error. Please try again or
                  contact support if the issue persists.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-time Updates Notice */}
      {isProcessing && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-800">
              <Loader2 className="w-5 h-5 animate-spin" />
              <div>
                <strong>Processing in Progress</strong>
                <p className="text-sm mt-1">
                  This page updates automatically. You can safely navigate away
                  and return later.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
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

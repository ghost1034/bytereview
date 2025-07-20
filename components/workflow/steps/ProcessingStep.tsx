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
  FileText,
  Brain,
  Database,
  AlertTriangle,
} from "lucide-react";
import { useJobDetails, useJobProgress } from "@/hooks/useJobs";
import { JobStatus, apiClient } from "@/lib/api";

// Simple global connection manager that survives component remounts
class SSEConnectionManager {
  private connections = new Map<string, EventSource>();
  private eventHandlersAttached = new Set<string>();

  getConnection(jobId: string): EventSource | null {
    return this.connections.get(jobId) || null;
  }

  setConnection(jobId: string, eventSource: EventSource): void {
    this.connections.set(jobId, eventSource);
  }

  closeConnection(jobId: string): void {
    const connection = this.connections.get(jobId);
    if (connection) {
      connection.close();
      this.connections.delete(jobId);
      this.eventHandlersAttached.delete(jobId);
    }
  }

  hasConnection(jobId: string): boolean {
    return this.connections.has(jobId);
  }

  hasEventHandlers(jobId: string): boolean {
    return this.eventHandlersAttached.has(jobId);
  }

  markEventHandlersAttached(jobId: string): void {
    this.eventHandlersAttached.add(jobId);
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
  const { data: progress, isLoading: progressLoading } = useJobProgress(jobId);
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  // SSE connection for real-time updates
  const eventSourceRef = useRef<EventSource | null>(null);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [totalTasks, setTotalTasks] = useState(0);
  const [processingSteps, setProcessingSteps] = useState<
    Array<{
      id: string;
      name: string;
      status: "pending" | "processing" | "completed" | "failed";
      startTime?: number;
      endTime?: number;
    }>
  >([]);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  // Simple local state for immediate completion updates
  const [jobCompleted, setJobCompleted] = useState(false);
  const [sseIntentionallyClosed, setSseIntentionallyClosed] = useState(false);

  // Simplified status derivation - single source of truth
  const isCompleted = jobDetails?.status === "completed" || jobCompleted;
  const isProcessing = jobDetails?.status === "processing" && !isCompleted;
  const isFailed = jobDetails?.status === "failed";

  // Update elapsed time every second (stop when job completes)
  useEffect(() => {
    if (isCompleted) return; // Stop updating when job is completed

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [isCompleted, startTime]);

  // SSE connection setup for real-time progress updates
  const setupSSEConnection = async () => {
    // Don't establish connection if job is already completed or SSE was intentionally closed
    if (isCompleted || sseIntentionallyClosed) {
      console.log(
        "Job completed or SSE intentionally closed, skipping SSE setup"
      );
      return;
    }

    // Check if a connection already exists globally
    if (sseManager.hasConnection(jobId)) {
      console.log("SSE connection already exists globally, skipping setup");
      // Get the existing connection and store in ref for this component
      eventSourceRef.current = sseManager.getConnection(jobId);
      return;
    }

    try {
      console.log("Setting up SSE connection for job processing updates");
      const token = await apiClient.getAuthTokenForSSE();
      if (!token) {
        console.warn("No auth token available for SSE");
        return;
      }

      const sseUrl = `${
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      }/api/jobs/${jobId}/events?token=${token}`;
      const eventSource = new EventSource(sseUrl);

      // Store in both ref and global manager
      eventSourceRef.current = eventSource;
      sseManager.setConnection(jobId, eventSource);

      // Only attach event handlers once per connection
      if (!sseManager.hasEventHandlers(jobId)) {
        sseManager.markEventHandlersAttached(jobId);

        eventSource.onopen = () => {
          console.log("SSE connection established for job processing");
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("Received SSE event:", data);

            switch (data.type) {
              case "task_started":
                console.log(`Task started: ${data.task_id}`);
                setCurrentStep(data.task_id);
                setProcessingSteps((prev) => {
                  const existing = prev.find(
                    (step) => step.id === data.task_id
                  );
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
                      name: `Processing Task ${prev.length + 1}`,
                      status: "processing",
                      startTime: Date.now(),
                    },
                  ];
                });
                break;

              case "task_completed":
                console.log(`Task completed: ${data.task_id}`);
                setCompletedTasks((prev) => {
                  const newCount = prev + 1;
                  console.log(
                    `Progress: ${newCount}/${
                      totalTasks || progress?.total_tasks || 0
                    }`
                  );
                  return newCount;
                });
                setProcessingSteps((prev) =>
                  prev.map((step) =>
                    step.id === data.task_id
                      ? { ...step, status: "completed", endTime: Date.now() }
                      : step
                  )
                );
                break;

              case "task_failed":
                console.log(`Task failed: ${data.task_id}`);
                setProcessingSteps((prev) =>
                  prev.map((step) =>
                    step.id === data.task_id
                      ? { ...step, status: "failed", endTime: Date.now() }
                      : step
                  )
                );
                break;

              case "job_completed":
                console.log("Job completed");
                setCurrentStep(null);

                // Mark job as completed immediately for UI updates
                setJobCompleted(true);
                setSseIntentionallyClosed(true);

                // Close SSE connection immediately to prevent further events
                eventSource.close();
                sseManager.closeConnection(jobId);
                eventSourceRef.current = null;

                // Remove event handlers to prevent any further processing
                eventSource.onmessage = null;
                eventSource.onerror = null;
                eventSource.onopen = null;
                break;

              case "job_already_completed":
                console.log("Job already completed, closing SSE connection");
                setJobCompleted(true);
                setSseIntentionallyClosed(true);

                // Close connection immediately since job is already done
                eventSource.close();
                sseManager.closeConnection(jobId);
                eventSourceRef.current = null;
                break;

              default:
                console.log(`Ignoring SSE event type: ${data.type}`);
            }
          } catch (error) {
            console.error("Error parsing SSE event:", error);
          }
        };

        eventSource.onerror = (error) => {
          console.error("SSE connection error:", error);
          // If the job is completed or SSE was intentionally closed, close the connection to prevent reconnection
          if (jobCompleted || sseIntentionallyClosed) {
            console.log(
              "SSE connection closed after job completion - preventing reconnection"
            );
            eventSource.close();
            sseManager.closeConnection(jobId);
            eventSourceRef.current = null;
            return;
          }
        };
      }
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
      setupSSEConnection();
    }

    // Clean up the SSE connection in the useEffect return function
    return () => {
      console.log("useEffect cleanup: closing SSE connection");
      sseManager.closeConnection(jobId);
      eventSourceRef.current = null;
    };
  }, []); // Empty dependency array - run once only

  // Update total tasks when progress data changes
  useEffect(() => {
    if (progress?.total_tasks) {
      setTotalTasks(progress.total_tasks);
    }
  }, [progress?.total_tasks]);

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
      case "processing":
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
    const completed = completedTasks || progress?.completed || 0;
    const total = totalTasks || progress?.total_tasks || 0;
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
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
            {progress && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-blue-600">
                    {totalTasks || progress.total_tasks}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Tasks
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-green-600">
                    {completedTasks || progress.completed}
                  </div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-orange-600">
                    {(totalTasks || progress.total_tasks) -
                      (completedTasks || progress.completed) -
                      progress.failed}
                  </div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-red-600">
                    {progress.failed}
                  </div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
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
                const duration =
                  step.endTime && step.startTime
                    ? Math.round((step.endTime - step.startTime) / 1000)
                    : null;

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
                        {step.status === "processing" && isCurrentStep
                          ? "Currently processing..."
                          : step.status === "completed"
                          ? `Completed in ${duration}s`
                          : step.status === "failed"
                          ? "Processing failed"
                          : "Waiting to start"}
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

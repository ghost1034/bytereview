"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getJobNavigationPath } from "@/lib/utils/jobNavigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface JobCardProps {
  job: {
    id: string;
    name?: string;
    config_step?: string;
    status: string;
    progress_percentage?: number;
    tasks_completed?: number;
    tasks_total?: number;
    tasks_failed?: number;
    created_at: string;
    latest_run_created_at?: string;
    latest_run_completed_at?: string | null;
    has_configured_fields?: boolean | null;
  };
  onDelete?: (jobId: string) => void;
}

export default function JobCard({ job, onDelete }: JobCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const getStepLabel = (step: string) => {
    const labels = {
      upload: "Upload Files",
      fields: "Configure Fields",
      review: "Review & Submit",
      submitted: "Submitted",
    };
    return labels[step as keyof typeof labels] || step;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: "Pending Run",
      in_progress: "In Progress",
      partially_completed: "Partially Complete",
      completed: "Completed",
      failed: "Failed",
      cancelled: "Cancelled",
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getStatusColor = (status: string, configStep: string) => {
    if (configStep !== "submitted") {
      return "orange"; // Wizard steps
    }

    switch (status) {
      case "completed":
        return "green";
      case "failed":
        return "red";
      case "partially_completed":
        return "yellow";
      case "in_progress":
        return "blue";
      default:
        return "gray";
    }
  };

  const getStatusIcon = (status: string, configStep: string) => {
    if (configStep !== "submitted") {
      return <Clock className="w-4 h-4" />;
    }

    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4" />;
      case "failed":
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleClick = () => {
    const path = getJobNavigationPath(job);
    router.push(path);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      await apiClient.deleteJob(job.id);
      toast({
        title: "Job deleted",
        description: "The job has been successfully deleted.",
      });

      // Call the onDelete callback to update the parent component
      if (onDelete) {
        onDelete(job.id);
      }

      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Error deleting job:", error);
      toast({
        title: "Error",
        description: "Failed to delete the job. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const statusColor = getStatusColor(job.status, job.config_step || "");
  const statusIcon = getStatusIcon(job.status, job.config_step || "");

  const startedAt = job.latest_run_created_at || job.created_at;
  const completedAt = job.latest_run_completed_at || undefined;

  return (
    <>
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={handleClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 bg-${statusColor}-100 rounded-lg flex items-center justify-center`}
              >
                <FileText className={`w-5 h-5 text-${statusColor}-600`} />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 mb-1">
                  {job.name || `Untitled Job`}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {statusIcon}
                  <span>{getStepLabel(job.config_step || "upload")}</span>
                  <span>•</span>
                  <span>Created {formatRelativeTime(startedAt)}</span>
                  {completedAt && (
                    <>
                      <span>•</span>
                      <span>Completed {formatRelativeTime(completedAt)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant="outline"
                  className={`bg-${statusColor}-50 text-${statusColor}-700 border-${statusColor}-200`}
                >
                  {getStatusLabel(job.status)}
                </Badge>

                {job.has_configured_fields !== undefined && (
                  job.has_configured_fields ? (
                    <div className="flex items-center text-sm text-green-500">
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
                      <span>Configured</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-sm text-red-500">
                      <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2" />
                      <span>Not Configured</span>
                    </div>
                  )
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => e.stopPropagation()}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <MoreHorizontal className="w-4 h-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Job
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{job.name || "Untitled Job"}"?
              This action cannot be undone and will permanently delete all
              associated files and results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Job"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateJobModal } from "@/components/jobs/create-job-modal";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
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

export function JobsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const loadJobs = async () => {
      try {
        const response = await apiClient.listJobs({ limit: 50, offset: 0 });
        setJobs(response.jobs || []);
      } catch (error) {
        console.error("Error loading jobs:", error);
      } finally {
        setLoading(false);
      }
    };

    loadJobs();
  }, []);

  const handleDeleteJob = async () => {
    if (!deleteJobId) return;

    setDeleting(true);
    try {
      await apiClient.deleteJob(deleteJobId);

      // Remove the job from the local state
      setJobs(jobs.filter((job) => job.id !== deleteJobId));

      toast({
        title: "Job deleted",
        description: "The job has been successfully deleted.",
      });
    } catch (error) {
      console.error("Error deleting job:", error);
      toast({
        title: "Error",
        description: "Failed to delete the job. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteJobId(null);
    }
  };

  const handleJobClick = (jobId: string) => {
    router.push(`/dashboard/jobs/${jobId}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3 mr-1" />
            Processing
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline">
            <AlertCircle className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDocumentCount = (job: any) => {
    // Try to get document count from various possible fields
    return job.documents_count || job.file_count || job.files?.length || 0;
  };

  const filteredJobs = jobs.filter((job) =>
    (job.name || `Job ${job.id}`)
      .toLowerCase()
      .includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-600 mt-1">
            Manage your document extraction jobs
          </p>
        </div>

        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create New Job
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Filter
        </Button>
      </div>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>All Jobs ({filteredJobs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 text-gray-400 mx-auto mb-4 animate-spin" />
              <p className="text-gray-600">Loading jobs...</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {jobs.length === 0 ? "No jobs yet" : "No jobs found"}
              </h3>
              <p className="text-gray-600 mb-4">
                {jobs.length === 0
                  ? "Create your first job to start extracting data from documents."
                  : "Try adjusting your search criteria."}
              </p>
              {jobs.length === 0 && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Job
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => handleJobClick(job.id)}
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">
                        {job.name || `Job ${job.id}`}
                      </h3>
                      <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                        <span className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatDate(job.created_at)}
                        </span>
                        <span className="flex items-center">
                          <FileText className="w-3 h-3 mr-1" />
                          {getDocumentCount(job)} documents
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {getStatusBadge(job.status)}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => e.stopPropagation()} // Prevent row click when clicking dropdown
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleJobClick(job.id)}
                        >
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem>Download Results</DropdownMenuItem>
                        <DropdownMenuItem>Duplicate Job</DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteJobId(job.id);
                          }}
                        >
                          Delete Job
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Job Modal */}
      <CreateJobModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />

      {/* Delete Job Confirmation Dialog */}
      <AlertDialog
        open={!!deleteJobId}
        onOpenChange={() => setDeleteJobId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this job? This action cannot be
              undone and will permanently delete all associated files and
              results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteJob}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting..." : "Delete Job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

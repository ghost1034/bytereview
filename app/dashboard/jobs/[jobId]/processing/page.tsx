"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import ProcessingStep from "@/components/workflow/steps/ProcessingStep";
import { useToast } from "@/hooks/use-toast";

async function getAuthToken(user: any): Promise<string> {
  if (!user) throw new Error("User not authenticated");
  return await user.getIdToken();
}

export default function JobProcessingPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const jobId = params.jobId as string;

  // Fetch job data
  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const token = await getAuthToken(user);
      const response = await fetch(`/api/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load job");
      return response.json();
    },
    enabled: !!user && !!jobId,
    staleTime: 5 * 60 * 1000, // 5 minutes - SSE provides real-time updates
    refetchInterval: (data) => {
      // Only refetch if job is not processing (SSE handles processing updates)
      if (data?.status === "in_progress") {
        return false; // Disable polling during processing - SSE handles this
      }
      return 30 * 1000; // 30 seconds for non-processing jobs
    },
  });

  const handleJobCompleted = (jobId: string) => {
    toast({
      title: "Processing completed",
      description: "Your data extraction has finished successfully!",
    });

    // Navigate to results page
    router.push(`/dashboard/jobs/${jobId}/results`);
  };

  const handleViewResults = () => {
    router.push(`/dashboard/jobs/${jobId}/results`);
  };

  const handleBack = () => {
    // Only allow going back if job is not yet submitted or is failed
    if (job?.config_step !== "submitted" || job?.status === "failed") {
      router.push(`/dashboard/jobs/${jobId}/review`);
    } else {
      toast({
        title: "Cannot go back",
        description: "Job is currently processing and cannot be modified",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading...</div>;
  }

  // Handle job status for resumability
  if (job?.status === "completed") {
    router.push(`/dashboard/jobs/${jobId}/results`);
    return (
      <div className="flex justify-center p-8">Redirecting to results...</div>
    );
  }

  // If job is not in processing state, redirect to appropriate step
  // if (job && job.status !== "in_progress") {
  //   if (job.config_step !== "submitted") {
  //     router.push(`/dashboard/jobs/${jobId}`);
  //     return (
  //       <div className="flex justify-center p-8">
  //         Redirecting to job configuration...
  //       </div>
  //     );
  //   }
  // }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Processing</h1>
        <p className="text-muted-foreground">
          AI is extracting data from your documents
        </p>
      </div>

      {/* Progress indicator */}
      <div className="text-center text-sm text-muted-foreground">
        Processing in progress...
      </div>

      {/* Processing Step */}
      <Card>
        <CardHeader>
          <CardTitle>Data Extraction</CardTitle>
        </CardHeader>
        <CardContent>
          <ProcessingStep
            jobId={jobId}
            onJobCompleted={handleJobCompleted}
            onViewResults={handleViewResults}
            onBack={handleBack}
          />
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        {job?.config_step !== "submitted" || job?.status === "failed" ? (
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Review
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/jobs")}
          >
            Back to Jobs
          </Button>
        )}

        {job?.status === "completed" && (
          <Button onClick={handleViewResults}>View Results</Button>
        )}
      </div>
    </div>
  );
}

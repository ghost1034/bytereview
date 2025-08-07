"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { getJobNavigationPath } from "@/lib/utils/jobNavigation";
import { apiClient } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function JobRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.jobId as string;

  useEffect(() => {
    const redirectToCorrectStep = async () => {
      try {
        // Fetch the job to get its current state
        const job = await apiClient.getJobDetails(jobId);
        
        // Use the same navigation logic as JobCard
        const correctPath = getJobNavigationPath(job);
        
        // Redirect to the correct step
        router.replace(correctPath);
      } catch (error) {
        console.error("Error fetching job for redirect:", error);
        // Fallback: redirect to upload step if job fetch fails
        router.replace(`/dashboard/jobs/${jobId}/upload`);
      }
    };

    if (jobId) {
      redirectToCorrectStep();
    }
  }, [jobId, router]);

  // Show loading while redirecting
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex items-center gap-3 text-gray-600">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Redirecting to job...</span>
      </div>
    </div>
  );
}
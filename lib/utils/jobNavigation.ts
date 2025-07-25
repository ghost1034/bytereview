/**
 * Utility functions for job navigation logic
 */

export interface JobNavigationData {
  id: string;
  config_step?: string;
  status: string;
}

/**
 * Determines the correct navigation path for a job based on its state
 */
export function getJobNavigationPath(job: JobNavigationData): string {
  // If job is completed, go to results page
  if (job.status === 'completed') {
    return `/dashboard/jobs/${job.id}/results`;
  }
  
  // If job is submitted but not completed, go to processing page
  if (job.config_step === 'submitted') {
    return `/dashboard/jobs/${job.id}/processing`;
  }
  
  // For jobs in wizard steps, go to the appropriate step page
  return `/dashboard/jobs/${job.id}/${job.config_step || 'upload'}`;
}

/**
 * Gets user-friendly step labels
 */
export function getStepLabel(step: string): string {
  const labels = {
    upload: 'Upload Files',
    fields: 'Configure Fields',
    review: 'Review & Submit',
    submitted: 'Processing'
  };
  return labels[step as keyof typeof labels] || step;
}

/**
 * Gets progress information for a job
 */
export function getJobProgress(job: {
  config_step?: string;
  progress_percentage?: number;
  tasks_completed?: number;
  tasks_total?: number;
}) {
  if (job.config_step && job.config_step !== 'submitted') {
    // For wizard steps, show step progress
    const stepIndex = ['upload', 'fields', 'review'].indexOf(job.config_step);
    const stepProgress = Math.round(((stepIndex + 1) / 3) * 100);
    return {
      percentage: stepProgress,
      text: `Step ${stepIndex + 1} of 3`
    };
  }
  
  // For submitted jobs, show task progress
  return {
    percentage: job.progress_percentage || 0,
    text: job.tasks_total && job.tasks_total > 0 ? `${job.tasks_completed || 0}/${job.tasks_total} tasks` : 'Processing...'
  };
}
"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, CheckCircle, AlertCircle, PlayCircle } from 'lucide-react';
import { JobRunListItem } from '@/lib/api';

interface RunSelectorProps {
  jobId: string;
  runs: JobRunListItem[];
  latestRunId: string;
  selectedRunId?: string;
  onChange: (runId: string) => void;
  disabled?: boolean;
  className?: string;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-3 h-3 text-green-500" />;
    case 'in_progress':
      return <PlayCircle className="w-3 h-3 text-blue-500" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-red-500" />;
    case 'pending':
      return <Clock className="w-3 h-3 text-gray-500" />;
    default:
      return <Clock className="w-3 h-3 text-gray-500" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    case 'pending':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    return 'Just now';
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
};

export default function RunSelector({
  jobId,
  runs,
  latestRunId,
  selectedRunId,
  onChange,
  disabled = false,
  className = ''
}: RunSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get current run ID from props or URL or default to latest
  const currentRunId = selectedRunId || searchParams.get('run_id') || latestRunId;

  // Find the selected run
  const selectedRun = runs.find(run => run.id === currentRunId);

  const handleRunChange = (runId: string) => {
    // Update URL with new run_id
    const params = new URLSearchParams(searchParams.toString());
    params.set('run_id', runId);
    
    // Get current pathname and update URL
    const currentPath = window.location.pathname;
    router.push(`${currentPath}?${params.toString()}`, { scroll: false });
    
    // Call onChange callback
    onChange(runId);
  };

  // If no runs available, don't render anything
  if (!runs || runs.length === 0) {
    return null;
  }

  // If only one run, show it as static info instead of dropdown
  if (runs.length === 1) {
    const run = runs[0];
    return (
      <div className={`flex items-center gap-2 p-2 bg-gray-50 rounded-md border ${className}`}>
        <Calendar className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-700">
          Run created {formatDate(run.created_at)}
        </span>
        <Badge variant="outline" className={getStatusColor(run.status)}>
          <div className="flex items-center gap-1">
            {getStatusIcon(run.status)}
            {run.status}
          </div>
        </Badge>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Job Run
        </label>
        {selectedRun && (
          <Badge variant="outline" className={getStatusColor(selectedRun.status)}>
            <div className="flex items-center gap-1">
              {getStatusIcon(selectedRun.status)}
              {selectedRun.status}
            </div>
          </Badge>
        )}
      </div>
      
      <Select
        value={currentRunId}
        onValueChange={handleRunChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {runs.map((run, index) => (
            <SelectItem key={run.id} value={run.id}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  {getStatusIcon(run.status)}
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {run.id === latestRunId ? 'Latest' : `Run ${runs.length - index}`}
                      </span>
                      {run.id === latestRunId && (
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          Latest
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDate(run.created_at)}
                      {run.completed_at && run.status === 'completed' && (
                        <span> • Completed {formatDate(run.completed_at)}</span>
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {run.tasks_total > 0 && (
                    <span className="text-xs text-gray-500">
                      {run.tasks_completed}/{run.tasks_total}
                    </span>
                  )}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {selectedRun && (
        <div className="text-xs text-gray-500 flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Created {formatDate(selectedRun.created_at)}
          </span>
          {selectedRun.tasks_total > 0 && (
            <span>
              {selectedRun.tasks_completed} of {selectedRun.tasks_total} tasks
            </span>
          )}
        </div>
      )}
    </div>
  );
}
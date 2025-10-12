"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, CheckCircle, AlertCircle, PlayCircle, Eye } from 'lucide-react';
import { JobRunListItem } from '@/lib/api';

interface RunSelectorProps {
  jobId: string;
  runs: JobRunListItem[];
  latestRunId: string;
  selectedRunId?: string;
  onChange: (runId: string) => void;
  onCreateNewRun?: () => void;
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
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

export default function RunSelector({
  jobId,
  runs,
  latestRunId,
  selectedRunId,
  onChange,
  onCreateNewRun,
  disabled = false,
  className = ''
}: RunSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get current run ID from props or URL or default to latest
  const currentRunId = selectedRunId || searchParams.get('run_id') || latestRunId;

  // Find the selected run
  const selectedRun = runs.find(run => run.id === currentRunId);
  
  // Check if we can create a new run (latest run must be completed or failed)
  const latestRun = runs.find(run => run.id === latestRunId);
  const canCreateNewRun = latestRun && (latestRun.status === 'completed' || latestRun.status === 'failed');

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
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md border">
          <Calendar className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-700">
            {formatDate(run.created_at)}
          </span>
          <Badge variant="outline" className={getStatusColor(run.status)}>
            <div className="flex items-center gap-1">
              {getStatusIcon(run.status)}
              {run.status}
            </div>
          </Badge>
        </div>
        
       {/* Actions to the right of the selector */}
       <div className="flex items-center gap-2">
         {/* View Results when the selected run is completed */}
         {selectedRun && selectedRun.status === 'completed' && (
           <Button
             variant="outline"
             size="sm"
             className="text-xs px-3 py-1 flex items-center gap-1"
             onClick={() => {
               const params = new URLSearchParams(searchParams.toString());
               params.set('run_id', selectedRun.id);
               router.push(`/dashboard/jobs/${jobId}/results?${params.toString()}`);
             }}
           >
             <Eye className="w-4 h-4" />
             View Results
           </Button>
         )}

         {/* New Run button */}
         {canCreateNewRun && onCreateNewRun && (
           <Button 
             variant="outline" 
             size="sm"
             onClick={onCreateNewRun}
             className="text-xs px-3 py-1"
           >
             + New Run
           </Button>
         )}
       </div>
     </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Select
        value={currentRunId}
        onValueChange={handleRunChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-auto min-w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {runs.map((run) => (
            <SelectItem key={run.id} value={run.id}>
              <div className="flex items-center gap-2">
                {getStatusIcon(run.status)}
                <div className="flex flex-col items-start">
                  <span className="text-sm">
                    {formatDate(run.created_at)}
                  </span>
                  <span className="text-xs text-gray-500 capitalize">
                    {run.status}
                  </span>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Actions to the right of the selector */}
      <div className="flex items-center gap-2">
        {/* View Results when the selected run is completed */}
        {selectedRun && selectedRun.status === 'completed' && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs px-3 py-1 flex items-center gap-1"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set('run_id', selectedRun.id);
              router.push(`/dashboard/jobs/${jobId}/results?${params.toString()}`);
            }}
          >
            <Eye className="w-4 h-4" />
            View Results
          </Button>
        )}

        {/* New Run button */}
        {canCreateNewRun && onCreateNewRun && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onCreateNewRun}
            className="text-xs px-3 py-1"
          >
            + New Run
          </Button>
        )}
      </div>
    </div>
  );
}
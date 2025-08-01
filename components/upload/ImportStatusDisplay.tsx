/**
 * Component for displaying real-time import status with polling
 * Shows progress, file details, and handles status updates
 */
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  RefreshCw,
  HardDrive,
  Cloud,
  Mail,
  FileText,
  Pause,
  Play
} from 'lucide-react';
import { useImportPoll } from '@/hooks/useOperationPoll';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ImportStatusDisplayProps {
  jobId: string;
  className?: string;
  onComplete?: () => void;
  showDetails?: boolean;
}

export function ImportStatusDisplay({
  jobId,
  className,
  onComplete,
  showDetails = true
}: ImportStatusDisplayProps) {
  const {
    status,
    isLoading,
    error,
    isPolling,
    startPolling,
    stopPolling,
    refetch,
    progress
  } = useImportPoll(jobId, {
    onComplete: (finalStatus) => {
      toast({
        title: "Import Complete",
        description: `Successfully imported ${progress.completed} files${progress.failed > 0 ? ` (${progress.failed} failed)` : ''}`,
        variant: progress.hasErrors ? "destructive" : "default"
      });
      onComplete?.();
    },
    onError: (error) => {
      toast({
        title: "Import Status Error",
        description: "Failed to get import status. Retrying...",
        variant: "destructive"
      });
    }
  });

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'computer':
      case 'upload':
        return <HardDrive className="h-4 w-4" />;
      case 'drive':
        return <Cloud className="h-4 w-4" />;
      case 'gmail':
        return <Mail className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'computer':
      case 'upload':
        return 'Computer';
      case 'drive':
        return 'Drive';
      case 'gmail':
        return 'Gmail';
      default:
        return 'Unknown';
    }
  };

  const getStatusIcon = (fileStatus: string) => {
    switch (fileStatus) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'importing':
      case 'uploading':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusLabel = (fileStatus: string) => {
    switch (fileStatus) {
      case 'completed':
        return 'Complete';
      case 'failed':
        return 'Failed';
      case 'importing':
        return 'Importing';
      case 'uploading':
        return 'Uploading';
      default:
        return 'Pending';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (error) {
    return (
      <Card className={cn("border-destructive", className)}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load import status</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="ml-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !status) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading import status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status || progress.total === 0) {
    return null; // No imports to show
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {progress.isComplete ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              )}
              Import Status
            </CardTitle>
            <CardDescription>
              {progress.completed} of {progress.total} files imported
              {progress.failed > 0 && (
                <span className="text-destructive ml-2">
                  ({progress.failed} failed)
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={isPolling ? stopPolling : startPolling}
              disabled={progress.isComplete}
            >
              {isPolling ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{progress.percentage}%</span>
          </div>
          <Progress value={progress.percentage} className="h-2" />
        </div>

        {/* Source breakdown */}
        {status.by_source && Object.keys(status.by_source).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Sources</h4>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(status.by_source).map(([source, count]) => (
                <Badge key={source} variant="secondary" className="flex items-center gap-1">
                  {getSourceIcon(source)}
                  {getSourceLabel(source)}: {count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Status breakdown */}
        {status.by_status && Object.keys(status.by_status).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Status</h4>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(status.by_status).map(([fileStatus, count]) => (
                <Badge 
                  key={fileStatus} 
                  variant={fileStatus === 'failed' ? 'destructive' : 'outline'}
                  className="flex items-center gap-1"
                >
                  {getStatusIcon(fileStatus)}
                  {getStatusLabel(fileStatus)}: {count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* File details */}
        {showDetails && status.files && status.files.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Files</h4>
              <ScrollArea className="h-48 border rounded-md">
                <div className="p-3 space-y-2">
                  {status.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-2 border rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        {getSourceIcon(file.source_type)}
                        {getStatusIcon(file.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {file.filename}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)} • {getSourceLabel(file.source_type)} • {getStatusLabel(file.status)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {/* Polling indicator */}
        {isPolling && !progress.isComplete && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span>Auto-updating every 2 seconds</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact version for smaller spaces
export function CompactImportStatus({
  jobId,
  className,
  onComplete
}: {
  jobId: string;
  className?: string;
  onComplete?: () => void;
}) {
  const { progress, isPolling } = useImportPoll(jobId, { onComplete });

  if (progress.total === 0) return null;

  return (
    <div className={cn("flex items-center gap-2 text-sm", className)}>
      {progress.isComplete ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      )}
      <span>
        Import: {progress.completed}/{progress.total} files
        {progress.failed > 0 && (
          <span className="text-destructive ml-1">({progress.failed} failed)</span>
        )}
      </span>
      {isPolling && !progress.isComplete && (
        <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
      )}
    </div>
  );
}
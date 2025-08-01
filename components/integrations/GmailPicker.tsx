/**
 * Gmail attachment picker component
 * Allows users to select attachments from recent Gmail messages
 */
'use client';

import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  Mail, 
  Paperclip, 
  Search, 
  Calendar,
  User,
  FileText,
  AlertCircle 
} from 'lucide-react';
import { useGoogleIntegration } from '@/hooks/useGoogleIntegration';
import { apiClient } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface GmailAttachment {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
  subject: string;
  from: string;
  date: string;
}

interface SelectedAttachment extends GmailAttachment {
  selected: boolean;
}

interface GmailPickerProps {
  onAttachmentsSelected: (attachments: GmailAttachment[]) => void;
  jobId?: string; // If provided, will trigger import automatically
  multiSelect?: boolean;
  mimeTypes?: string[];
  className?: string;
}

export function GmailPicker({
  onAttachmentsSelected,
  jobId,
  multiSelect = true,
  mimeTypes = ['application/pdf'],
  className
}: GmailPickerProps) {
  const { status, connect, isConnecting } = useGoogleIntegration();
  const [searchInput, setSearchInput] = useState('');
  const [executedQuery, setExecutedQuery] = useState('');
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(new Set());

  // Query for Gmail messages with attachments
  const {
    data: attachments,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['gmail-attachments', executedQuery],
    queryFn: async (): Promise<GmailAttachment[]> => {
      if (!status?.connected) {
        return [];
      }

      const response = await apiClient.getGmailAttachments(
        executedQuery,
        mimeTypes.join(','),
        50
      );
      return response.attachments || [];
    },
    enabled: !!status?.connected && !!executedQuery,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });

  const handleSearch = useCallback((query: string) => {
    const searchTerm = query || 'has:attachment';
    setExecutedQuery(searchTerm);
    setSelectedAttachments(new Set());
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(searchInput);
    }
  }, [searchInput, handleSearch]);

  const handleAttachmentToggle = useCallback((attachmentId: string) => {
    setSelectedAttachments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(attachmentId)) {
        newSet.delete(attachmentId);
      } else {
        if (!multiSelect) {
          newSet.clear();
        }
        newSet.add(attachmentId);
      }
      return newSet;
    });
  }, [multiSelect]);

  const handleSelectAll = useCallback(() => {
    if (!attachments) return;
    
    const allIds = attachments.map(att => `${att.messageId}-${att.attachmentId}`);
    setSelectedAttachments(new Set(allIds));
  }, [attachments]);

  const handleClearSelection = useCallback(() => {
    setSelectedAttachments(new Set());
  }, []);

  const handleConfirmSelection = useCallback(async () => {
    if (!attachments) return;

    const selected = attachments.filter(att => selectedAttachments.has(`${att.messageId}-${att.attachmentId}`));
    onAttachmentsSelected(selected);
    
    // If jobId is provided, automatically trigger import
    if (jobId) {
      try {
        const { apiClient } = await import('@/lib/api');
        
        // Convert to the format expected by the API
        const attachmentData = selected.map(att => ({
          message_id: att.messageId,
          attachment_id: att.attachmentId,
          filename: att.filename
        }));
        
        const result = await apiClient.importGmailAttachments(jobId, attachmentData);
        
        toast({
          title: "Import Started",
          description: `Started importing ${selected.length} attachment${selected.length !== 1 ? 's' : ''} from Gmail`,
          variant: "default"
        });
      } catch (error) {
        console.error('Failed to start Gmail import:', error);
        toast({
          title: "Import Failed",
          description: "Failed to start importing attachments from Gmail",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Attachments Selected",
        description: `Selected ${selected.length} attachment${selected.length !== 1 ? 's' : ''} from Gmail`,
        variant: "default"
      });
    }
  }, [attachments, selectedAttachments, onAttachmentsSelected, jobId]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!status?.connected) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Attachments
          </CardTitle>
          <CardDescription>
            Connect your Google account to import attachments from Gmail
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => connect('gmail')}
            disabled={isConnecting}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Connect Gmail
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Gmail Attachments
          <Badge variant="secondary" className="ml-auto">Connected</Badge>
        </CardTitle>
        <CardDescription>
          Select attachments from your Gmail messages
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails (e.g., from:sender@example.com has:attachment)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="pl-10"
            />
          </div>
          <Button 
            onClick={() => handleSearch(searchInput)}
            disabled={isLoading}
            variant="outline"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Quick filters */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const query = 'has:attachment newer_than:7d';
              setSearchInput(query);
              handleSearch(query);
            }}
          >
            Last 7 days
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const query = 'has:attachment filename:pdf';
              setSearchInput(query);
              handleSearch(query);
            }}
          >
            PDF files
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const query = 'has:attachment larger:1M';
              setSearchInput(query);
              handleSearch(query);
            }}
          >
            Large files
          </Button>
        </div>

        {/* Results */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load Gmail attachments. Please try again.</span>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading attachments...</span>
          </div>
        )}

        {attachments && attachments.length > 0 && (
          <>
            {/* Selection controls */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {attachments.length} attachment{attachments.length !== 1 ? 's' : ''} found
                {selectedAttachments.size > 0 && (
                  <span className="ml-2 font-medium">
                    ({selectedAttachments.size} selected)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {multiSelect && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={selectedAttachments.size === attachments.length}
                  >
                    Select All
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={selectedAttachments.size === 0}
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Attachment list */}
            <ScrollArea className="h-64 border rounded-md">
              <div className="p-4 space-y-3">
                {attachments.map((attachment) => (
                  <div
                    key={`${attachment.messageId}-${attachment.attachmentId}`}
                    className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleAttachmentToggle(`${attachment.messageId}-${attachment.attachmentId}`)}
                  >
                    <Checkbox
                      checked={selectedAttachments.has(`${attachment.messageId}-${attachment.attachmentId}`)}
                      onChange={() => handleAttachmentToggle(`${attachment.messageId}-${attachment.attachmentId}`)}
                    />
                    
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm truncate">
                          {attachment.filename}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {formatFileSize(attachment.size)}
                        </Badge>
                      </div>
                      
                      <div className="text-sm text-muted-foreground truncate">
                        <Mail className="inline h-3 w-3 mr-1" />
                        {attachment.subject}
                      </div>
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {attachment.from}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(attachment.date), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Confirm selection */}
            {selectedAttachments.size > 0 && (
              <>
                <Separator />
                <Button 
                  onClick={handleConfirmSelection}
                  className="w-full"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Import {selectedAttachments.size} Attachment{selectedAttachments.size !== 1 ? 's' : ''}
                </Button>
              </>
            )}
          </>
        )}

        {attachments && attachments.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No attachments found matching your search.</p>
            <p className="text-sm mt-1">Try adjusting your search query.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Simplified button version
export function GmailPickerButton({
  onAttachmentsSelected,
  multiSelect = true,
  className
}: {
  onAttachmentsSelected: (attachments: GmailAttachment[]) => void;
  multiSelect?: boolean;
  className?: string;
}) {
  const { status, connect, isConnecting } = useGoogleIntegration();

  if (!status?.connected) {
    return (
      <Button 
        onClick={() => connect('gmail')}
        disabled={isConnecting}
        variant="outline"
        className={className}
      >
        {isConnecting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            Connect Gmail
          </>
        )}
      </Button>
    );
  }

  return (
    <Button variant="outline" className={className}>
      <Paperclip className="mr-2 h-4 w-4" />
      Select from Gmail
    </Button>
  );
}
/**
 * Google Drive file picker component
 * Uses Google Picker API to allow users to select files from their Drive
 */
'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderOpen, FileText, AlertCircle } from 'lucide-react';
import { useGoogleIntegration } from '@/hooks/useGoogleIntegration';
import { apiClient } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

// Google Picker API types
declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

interface SelectedFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  iconUrl?: string;
  url?: string;
}

interface GoogleDrivePickerProps {
  onFilesSelected: (files: SelectedFile[]) => void;
  jobId?: string; // If provided, will trigger import automatically
  multiSelect?: boolean;
  mimeTypes?: string[];
  className?: string;
}

export function GoogleDrivePicker({
  onFilesSelected,
  jobId,
  multiSelect = true,
  mimeTypes = ['application/pdf'], // Default to PDFs
  className
}: GoogleDrivePickerProps) {
  const { status, connect, isConnecting } = useGoogleIntegration();
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [isGoogleApiLoaded, setIsGoogleApiLoaded] = useState(false);
  const [apiLoadError, setApiLoadError] = useState<string | null>(null);
  const loadAttemptedRef = useRef(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Load Google APIs only when user is connected
  useEffect(() => {
    if (!clientId) {
      console.error('NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured');
      return;
    }

    // Only load APIs if user is connected to Google
    if (!status?.connected) {
      return;
    }

    const loadGoogleApis = async () => {
      // Prevent duplicate loading using ref (survives re-renders)
      if (loadAttemptedRef.current) {
        console.log('APIs already attempted, skipping...');
        return;
      }

      // Mark as attempted
      loadAttemptedRef.current = true;

      try {
        console.log('Starting to load Google APIs...');
        setApiLoadError(null);
        
        // Check if already loaded
        if (window.google?.picker) {
          console.log('Google Picker API already loaded');
          setIsGoogleApiLoaded(true);
          return;
        }
        
        // Load Google Picker API with timeout
        console.log('Loading Google Picker API...');
        await Promise.race([
          new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
              console.log('Google API script loaded');
              // Load the picker library
              window.gapi.load('picker', {
                callback: () => {
                  console.log('Google Picker library loaded');
                  resolve(true);
                },
                onerror: (error: any) => {
                  console.error('Failed to load picker library:', error);
                  reject(new Error('Failed to load picker library'));
                }
              });
            };
            script.onerror = (error) => {
              console.error('Failed to load Google API script:', error);
              reject(new Error('Failed to load Google API script'));
            };
            document.head.appendChild(script);
          }),
          // 10 second timeout
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout loading Google APIs')), 10000)
          )
        ]);

        console.log('Google APIs loaded successfully');
        setIsGoogleApiLoaded(true);
        setApiLoadError(null);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Failed to load Google APIs:', errorMessage);
        setIsGoogleApiLoaded(false);
        setApiLoadError(errorMessage);
        loadAttemptedRef.current = false; // Reset so user can retry
        toast({
          title: "Google APIs Failed to Load",
          description: `Unable to load Google Drive picker: ${errorMessage}`,
          variant: "destructive"
        });
      }
    };

    loadGoogleApis();
  }, [clientId, status?.connected]);

  const openPicker = useCallback(async () => {
    console.log('openPicker called', {
      isGoogleApiLoaded,
      hasGooglePicker: !!window.google?.picker,
      isConnected: status?.connected
    });

    if (!isGoogleApiLoaded || !window.google?.picker || !status?.connected) {
      console.warn('Picker not ready:', {
        isGoogleApiLoaded,
        hasGooglePicker: !!window.google?.picker,
        isConnected: status?.connected
      });
      return;
    }

    setIsPickerLoading(true);

    try {
      // Get access token (this should be handled by the backend, but for picker we need it client-side)
      // In a real implementation, you'd get this from your backend
      console.log('Getting access token...');
      const accessToken = await getAccessToken();
      console.log('Access token received:', !!accessToken);

      if (!accessToken) {
        console.error('No access token available');
        toast({
          title: "Authentication Required",
          description: "Please refresh your Google connection.",
          variant: "destructive"
        });
        return;
      }

      // Create picker for individual files only (no folder selection)
      const driveView = new window.google.picker.DocsView()
        .setIncludeFolders(false)  // Disable folder selection for OAuth compliance
        .setSelectFolderEnabled(false)  // Disable folder selection
        .setMimeTypes(mimeTypes.join(','))
        .setParent('root')  // Show actual My Drive content
        .setMode(window.google.picker.DocsViewMode.LIST);  // Use list mode to avoid thumbnails

      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(multiSelect ? window.google.picker.Feature.MULTISELECT_ENABLED : null)
        .setOAuthToken(accessToken)
        .addView(driveView)
        .setCallback(handlePickerCallback)
        .build();

      picker.setVisible(true);
    } catch (error) {
      console.error('Failed to open picker:', error);
      toast({
        title: "Picker Failed",
        description: "Unable to open Google Drive picker. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsPickerLoading(false);
    }
  }, [isGoogleApiLoaded, status?.connected, multiSelect, mimeTypes]);

  const handlePickerCallback = useCallback(async (data: any) => {
    if (data.action === window.google.picker.Action.PICKED) {
      const files: SelectedFile[] = data.docs.map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        mimeType: doc.mimeType,
        size: doc.sizeBytes ? parseInt(doc.sizeBytes) : undefined,
        iconUrl: doc.iconUrl,
        url: doc.url
      }));

      onFilesSelected(files);
      
      // If jobId is provided, automatically trigger import
      if (jobId) {
        try {
          const { apiClient } = await import('@/lib/api');
          const fileIds = files.map(file => file.id);
          
          const result = await apiClient.importDriveFiles(jobId, fileIds);
          
          toast({
            title: "Import Started",
            description: `Started importing ${files.length} item${files.length !== 1 ? 's' : ''} from Google Drive`,
            variant: "default"
          });
        } catch (error) {
          console.error('Failed to start Drive import:', error);
          toast({
            title: "Import Failed",
            description: "Failed to start importing files from Google Drive",
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Files Selected",
          description: `Selected ${files.length} file${files.length !== 1 ? 's' : ''} from Google Drive`,
          variant: "default"
        });
      }
    }
  }, [onFilesSelected, jobId]);

  // Get access token from backend using apiClient
  const getAccessToken = async (): Promise<string | null> => {
    try {
      const response = await apiClient.request('/api/integrations/google/picker-token');
      return response.access_token;
    } catch (error) {
      console.error('Failed to get access token for picker:', error);
      return null;
    }
  };

  if (!clientId) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Google Drive integration not configured</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status?.connected) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Google Drive
          </CardTitle>
          <CardDescription>
            Connect your Google account to import files from Drive
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => connect('drive')}
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
                <FolderOpen className="mr-2 h-4 w-4" />
                Connect Google Drive
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
          <FolderOpen className="h-5 w-5" />
          Google Drive
          <Badge variant="secondary" className="ml-auto">Connected</Badge>
        </CardTitle>
        <CardDescription>
          Browse and select individual files or ZIP archives from your Google Drive
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Supported file types: {mimeTypes.includes('application/pdf') ? 'PDF' : 'Various'}
            <br />
            <span className="text-xs text-amber-600">Note: Folder selection disabled for OAuth compliance. Select individual files or ZIP archives instead.</span>
          </div>
          
          <Button 
            onClick={openPicker}
            disabled={isPickerLoading || (!isGoogleApiLoaded && status?.connected)}
            className="w-full"
          >
            {isPickerLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening Picker...
              </>
            ) : !isGoogleApiLoaded && status?.connected ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Google APIs...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Select from Drive
              </>
            )}
          </Button>
          
          {!isGoogleApiLoaded && status?.connected && !apiLoadError && (
            <div className="text-xs text-muted-foreground text-center">
              Loading Google Drive integration...
            </div>
          )}
          
          {apiLoadError && (
            <div className="text-center space-y-2">
              <div className="text-xs text-destructive">
                Failed to load Google APIs: {apiLoadError}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setApiLoadError(null);
                  setIsGoogleApiLoaded(false);
                  loadAttemptedRef.current = false; // Reset the ref
                  // Force re-trigger the useEffect
                  setIsLoadingApis(false);
                }}
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Simplified version for inline use
export function GoogleDrivePickerButton({
  onFilesSelected,
  multiSelect = true,
  className
}: {
  onFilesSelected: (files: SelectedFile[]) => void;
  multiSelect?: boolean;
  className?: string;
}) {
  const { status, connect, isConnecting } = useGoogleIntegration();

  if (!status?.connected) {
    return (
      <Button 
        onClick={() => connect('drive')}
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
            <FolderOpen className="mr-2 h-4 w-4" />
            Connect Drive
          </>
        )}
      </Button>
    );
  }

  return (
    <Button variant="outline" className={className}>
      <FolderOpen className="mr-2 h-4 w-4" />
      Select from Drive
    </Button>
  );
}
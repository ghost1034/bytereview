/**
 * Google Drive folder picker component for export destinations
 * Uses Google Picker API to allow users to select folders for exporting files
 */
'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderOpen, Folder, AlertCircle } from 'lucide-react';
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

interface SelectedFolder {
  id: string;
  name: string;
  url?: string;
}

interface GoogleDriveFolderPickerProps {
  onFolderSelected: (folder: SelectedFolder) => void;
  selectedFolder?: SelectedFolder | null;
  className?: string;
  buttonText?: string;
  showCard?: boolean;
}

export function GoogleDriveFolderPicker({
  onFolderSelected,
  selectedFolder,
  className,
  buttonText = "Select Export Folder",
  showCard = true
}: GoogleDriveFolderPickerProps) {
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
        console.log('Starting to load Google APIs for folder picker...');
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
          description: `Unable to load Google Drive folder picker: ${errorMessage}`,
          variant: "destructive"
        });
      }
    };

    loadGoogleApis();
  }, [clientId, status?.connected]);

  const openFolderPicker = useCallback(async () => {
    console.log('openFolderPicker called', {
      isGoogleApiLoaded,
      hasGooglePicker: !!window.google?.picker,
      isConnected: status?.connected
    });

    if (!isGoogleApiLoaded || !window.google?.picker || !status?.connected) {
      console.warn('Folder picker not ready:', {
        isGoogleApiLoaded,
        hasGooglePicker: !!window.google?.picker,
        isConnected: status?.connected
      });
      return;
    }

    setIsPickerLoading(true);

    try {
      // Get access token
      console.log('Getting access token for folder picker...');
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

      // Create folder picker - only show folders
      const folderView = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(true)
        .setMimeTypes('application/vnd.google-apps.folder')
        .setParent('root')  // Show My Drive folders
        .setMode(window.google.picker.DocsViewMode.LIST);

      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)  // Hide navigation for cleaner UI
        .setOAuthToken(accessToken)
        .addView(folderView)
        .setCallback(handlePickerCallback)
        .setTitle('Select Export Destination Folder')
        .build();

      picker.setVisible(true);
    } catch (error) {
      console.error('Failed to open folder picker:', error);
      toast({
        title: "Picker Failed",
        description: "Unable to open Google Drive folder picker. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsPickerLoading(false);
    }
  }, [isGoogleApiLoaded, status?.connected]);

  const handlePickerCallback = useCallback(async (data: any) => {
    if (data.action === window.google.picker.Action.PICKED) {
      const folder = data.docs[0]; // Only one folder can be selected
      
      if (folder && folder.mimeType === 'application/vnd.google-apps.folder') {
        const selectedFolder: SelectedFolder = {
          id: folder.id,
          name: folder.name,
          url: folder.url
        };

        onFolderSelected(selectedFolder);
        
        toast({
          title: "Folder Selected",
          description: `Selected "${folder.name}" as export destination`,
          variant: "default"
        });
      } else {
        toast({
          title: "Invalid Selection",
          description: "Please select a folder, not a file.",
          variant: "destructive"
        });
      }
    }
  }, [onFolderSelected]);

  // Get access token from backend using apiClient
  const getAccessToken = async (): Promise<string | null> => {
    try {
      const response = await apiClient.request('/api/integrations/google/picker-token');
      return response.access_token;
    } catch (error) {
      console.error('Failed to get access token for folder picker:', error);
      return null;
    }
  };

  if (!clientId) {
    const content = (
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Google Drive integration not configured</span>
      </div>
    );

    return showCard ? (
      <Card className={className}>
        <CardContent className="pt-6">
          {content}
        </CardContent>
      </Card>
    ) : content;
  }

  if (!status?.connected) {
    const content = (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span className="text-sm">Connect Google Drive to select export folder</span>
        </div>
        <Button 
          onClick={() => connect('drive')}
          disabled={isConnecting}
          size="sm"
          variant="outline"
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
      </div>
    );

    return showCard ? (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Export Destination
          </CardTitle>
          <CardDescription>
            Connect your Google account to select an export folder
          </CardDescription>
        </CardHeader>
        <CardContent>
          {content}
        </CardContent>
      </Card>
    ) : content;
  }

  const pickerButton = (
    <Button 
      onClick={openFolderPicker}
      disabled={isPickerLoading || (!isGoogleApiLoaded && status?.connected)}
      variant="outline"
      className="flex items-center gap-2"
    >
      {isPickerLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening Picker...
        </>
      ) : !isGoogleApiLoaded && status?.connected ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        <>
          <Folder className="h-4 w-4" />
          {buttonText}
        </>
      )}
    </Button>
  );

  const content = (
    <div className="space-y-4">
      {selectedFolder && (
        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
          <Folder className="w-5 h-5 text-green-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">
              Export Destination: {selectedFolder.name}
            </p>
            <p className="text-xs text-green-600">
              Files will be saved to this Google Drive folder
            </p>
          </div>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            Selected
          </Badge>
        </div>
      )}
      
      <div className="flex items-center gap-3">
        {pickerButton}
        
        {selectedFolder && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFolderSelected({ id: '', name: 'My Drive' })}
          >
            Use My Drive
          </Button>
        )}
      </div>
      
      {!isGoogleApiLoaded && status?.connected && !apiLoadError && (
        <div className="text-xs text-muted-foreground">
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
              loadAttemptedRef.current = false;
            }}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );

  return showCard ? (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5" />
          Export Destination
          <Badge variant="secondary" className="ml-auto">Connected</Badge>
        </CardTitle>
        <CardDescription>
          Select a Google Drive folder for exporting results
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  ) : content;
}
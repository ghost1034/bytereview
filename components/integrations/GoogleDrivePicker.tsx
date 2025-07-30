/**
 * Google Drive file picker component
 * Uses Google Picker API to allow users to select files from their Drive
 */
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderOpen, FileText, AlertCircle } from 'lucide-react';
import { useGoogleIntegration } from '@/hooks/useGoogleIntegration';
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
  multiSelect?: boolean;
  allowFolders?: boolean;
  mimeTypes?: string[];
  className?: string;
}

export function GoogleDrivePicker({
  onFilesSelected,
  multiSelect = true,
  allowFolders = true,
  mimeTypes = ['application/pdf'], // Default to PDFs
  className
}: GoogleDrivePickerProps) {
  const { status, connect, isConnecting } = useGoogleIntegration();
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [isGoogleApiLoaded, setIsGoogleApiLoaded] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Load Google APIs
  useEffect(() => {
    if (!clientId) {
      console.error('NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured');
      return;
    }

    const loadGoogleApis = async () => {
      try {
        // Load Google APIs script if not already loaded
        if (!window.gapi) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        // Load Google Picker API
        if (!window.google?.picker) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js?onload=onGoogleApiLoad';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });

          // Wait for picker to be available
          await new Promise((resolve) => {
            const checkPicker = () => {
              if (window.google?.picker) {
                resolve(true);
              } else {
                setTimeout(checkPicker, 100);
              }
            };
            checkPicker();
          });
        }

        setIsGoogleApiLoaded(true);
      } catch (error) {
        console.error('Failed to load Google APIs:', error);
        toast({
          title: "Google APIs Failed to Load",
          description: "Unable to load Google Drive picker. Please refresh the page.",
          variant: "destructive"
        });
      }
    };

    loadGoogleApis();
  }, [clientId]);

  const openPicker = useCallback(async () => {
    if (!isGoogleApiLoaded || !window.google?.picker || !status?.connected) {
      return;
    }

    setIsPickerLoading(true);

    try {
      // Get access token (this should be handled by the backend, but for picker we need it client-side)
      // In a real implementation, you'd get this from your backend
      const accessToken = await getAccessToken();

      if (!accessToken) {
        toast({
          title: "Authentication Required",
          description: "Please refresh your Google connection.",
          variant: "destructive"
        });
        return;
      }

      // Create picker
      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
        .enableFeature(multiSelect ? window.google.picker.Feature.MULTISELECT_ENABLED : null)
        .setOAuthToken(accessToken)
        .addView(
          new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setMimeTypes(mimeTypes.join(','))
            .setSelectFolderEnabled(allowFolders)
        )
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
  }, [isGoogleApiLoaded, status?.connected, multiSelect, allowFolders, mimeTypes]);

  const handlePickerCallback = useCallback((data: any) => {
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
      
      toast({
        title: "Files Selected",
        description: `Selected ${files.length} file${files.length !== 1 ? 's' : ''} from Google Drive`,
        variant: "default"
      });
    }
  }, [onFilesSelected]);

  // Placeholder function - in real implementation, this would call your backend
  const getAccessToken = async (): Promise<string | null> => {
    // This is a simplified version. In reality, you'd:
    // 1. Call your backend to get a fresh access token
    // 2. Handle token refresh if needed
    // 3. Return the token for picker use
    
    // For now, return null to indicate we need proper token handling
    return null;
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
          Select files from your Google Drive
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Supported file types: {mimeTypes.includes('application/pdf') ? 'PDF' : 'Various'}
            {allowFolders && ', Folders'}
          </div>
          
          <Button 
            onClick={openPicker}
            disabled={isPickerLoading || !isGoogleApiLoaded}
            className="w-full"
          >
            {isPickerLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening Picker...
              </>
            ) : !isGoogleApiLoaded ? (
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
          
          {!isGoogleApiLoaded && (
            <div className="text-xs text-muted-foreground text-center">
              Loading Google Drive integration...
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
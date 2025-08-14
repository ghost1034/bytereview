/**
 * Hook for managing Google OAuth integration state and operations
 */
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export interface GoogleIntegrationStatus {
  connected: boolean;
  scopes: string[];
  expires_at: string | null;
  is_expired: boolean;
  drive_capabilities?: {
    can_import: boolean;
    can_export: boolean;
    has_limited_access: boolean;
  };
}

export interface GoogleAuthResponse {
  success: boolean;
  provider: string;
  scopes: string[];
  user_email: string;
  expires_at: string | null;
}

export function useGoogleIntegration() {
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  // Query for current integration status
  const {
    data: status,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['google-integration-status'],
    queryFn: async (): Promise<GoogleIntegrationStatus> => {
      return await apiClient.getGoogleIntegrationStatus();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1
  });

  // Mutation for getting auth URL
  const getAuthUrlMutation = useMutation({
    mutationFn: async (scopes: string = 'combined') => {
      return await apiClient.getGoogleAuthUrl(scopes);
    },
    onSuccess: (data) => {
      // Redirect to Google OAuth
      window.location.href = data.auth_url;
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.response?.data?.detail || "Failed to start Google authorization",
        variant: "destructive"
      });
      setIsConnecting(false);
    }
  });

  // Mutation for exchanging OAuth code
  const exchangeCodeMutation = useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      return await apiClient.exchangeGoogleCode(code, state);
    },
    onSuccess: (data: GoogleAuthResponse) => {
      toast({
        title: "Google Connected",
        description: `Successfully connected to ${data.user_email}`,
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['google-integration-status'] });
      setIsConnecting(false);
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.response?.data?.detail || "Failed to complete Google authorization",
        variant: "destructive"
      });
      setIsConnecting(false);
    }
  });

  // Mutation for disconnecting
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiClient.disconnectGoogleIntegration();
    },
    onSuccess: () => {
      toast({
        title: "Google Disconnected",
        description: "Successfully disconnected from Google",
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['google-integration-status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnect Failed",
        description: error.response?.data?.detail || "Failed to disconnect from Google",
        variant: "destructive"
      });
    }
  });

  // Mutation for refreshing token
  const refreshTokenMutation = useMutation({
    mutationFn: async () => {
      return await apiClient.refreshGoogleToken();
    },
    onSuccess: () => {
      toast({
        title: "Token Refreshed",
        description: "Google access token has been refreshed",
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['google-integration-status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: error.response?.data?.detail || "Failed to refresh Google token. Please reconnect.",
        variant: "destructive"
      });
    }
  });

  // Connect to Google
  const connect = useCallback((scopes: string = 'combined') => {
    setIsConnecting(true);
    getAuthUrlMutation.mutate(scopes);
  }, [getAuthUrlMutation]);

  // Disconnect from Google
  const disconnect = useCallback(() => {
    disconnectMutation.mutate();
  }, [disconnectMutation]);

  // Refresh token
  const refreshToken = useCallback(() => {
    refreshTokenMutation.mutate();
  }, [refreshTokenMutation]);

  // Handle OAuth callback
  const handleOAuthCallback = useCallback((code: string, state: string) => {
    exchangeCodeMutation.mutate({ code, state });
  }, [exchangeCodeMutation]);

  // Check if token needs refresh
  const needsRefresh = status?.is_expired || false;

  // Auto-refresh disabled to prevent infinite loops
  // Users can manually refresh using the refresh button if needed
  // TODO: Implement auto-refresh with proper debouncing in the future

  return {
    // Status
    status,
    isLoading,
    error,
    isConnecting,
    needsRefresh,
    
    // Actions
    connect,
    disconnect,
    refreshToken,
    handleOAuthCallback,
    refetch,
    
    // Mutation states
    isConnectingToGoogle: getAuthUrlMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    isRefreshing: refreshTokenMutation.isPending
  };
}
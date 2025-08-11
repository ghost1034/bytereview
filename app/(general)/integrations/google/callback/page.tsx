/**
 * Google OAuth callback page
 * Handles the redirect from Google OAuth and exchanges the code for tokens
 */
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGoogleIntegration } from '@/hooks/useGoogleIntegration';
import { useAuth } from '@/contexts/AuthContext';

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handleOAuthCallback } = useGoogleIntegration();
  const { user, loading } = useAuth();
  
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple executions
    if (hasProcessedRef.current) {
      return;
    }

    // Wait for Firebase auth to be ready
    if (loading) {
      return;
    }

    // Check if user is authenticated
    if (!user) {
      hasProcessedRef.current = true;
      setStatus('error');
      setErrorMessage('Authentication required. Please sign in and try again.');
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle OAuth errors
    if (error) {
      hasProcessedRef.current = true;
      setStatus('error');
      if (error === 'access_denied') {
        setErrorMessage('You declined to authorize ian.ai. Please try again if you want to connect Google services.');
      } else {
        setErrorMessage(`OAuth error: ${error}`);
      }
      return;
    }

    // Handle missing parameters
    if (!code || !state) {
      hasProcessedRef.current = true;
      setStatus('error');
      setErrorMessage('Missing authorization code or state parameter. Please try connecting again.');
      return;
    }

    // Mark as processed to prevent re-execution
    hasProcessedRef.current = true;

    // Exchange the code for tokens
    handleOAuthCallback(code, state);
    
    // Set success status (the hook will handle errors via toast)
    setStatus('success');
    
    // Redirect after a short delay
    setTimeout(() => {
      // Try to redirect to the page they came from, or default to dashboard
      const returnTo = sessionStorage.getItem('oauth-return-to') || '/dashboard';
      sessionStorage.removeItem('oauth-return-to');
      router.push(returnTo);
    }, 2000);

  }, [searchParams, loading, user]); // Wait for auth state to be ready

  const handleRetry = () => {
    router.push('/dashboard');
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4">
            {status === 'processing' && (
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
            )}
            {status === 'success' && (
              <CheckCircle className="h-8 w-8 text-green-500" />
            )}
            {status === 'error' && (
              <AlertCircle className="h-8 w-8 text-red-500" />
            )}
          </div>
          
          <CardTitle className="text-xl">
            {status === 'processing' && 'Connecting Google Account...'}
            {status === 'success' && 'Google Connected!'}
            {status === 'error' && 'Connection Failed'}
          </CardTitle>
          
          <CardDescription>
            {status === 'processing' && loading && 'Authenticating...'}
            {status === 'processing' && !loading && 'Please wait while we complete the connection to your Google account.'}
            {status === 'success' && 'Your Google account has been successfully connected. Redirecting you back...'}
            {status === 'error' && errorMessage}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {status === 'processing' && (
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span>Exchanging authorization code...</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                <span>Storing encrypted credentials...</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                <span>Finalizing connection...</span>
              </div>
            </div>
          )}
          
          {status === 'success' && (
            <div className="space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                You can now import files from Google Drive and Gmail attachments.
              </div>
              <Button 
                onClick={handleGoToDashboard} 
                className="w-full"
              >
                Go to Dashboard
              </Button>
            </div>
          )}
          
          {status === 'error' && (
            <div className="space-y-4">
              <div className="text-center">
                <Button 
                  onClick={handleRetry}
                  className="w-full"
                >
                  Return to Dashboard
                </Button>
              </div>
              <div className="text-center">
                <Button 
                  variant="outline"
                  onClick={() => router.push('/help')}
                  className="w-full"
                >
                  Get Help
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
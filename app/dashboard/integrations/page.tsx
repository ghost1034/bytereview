/**
 * Integrations settings page
 * Allows users to manage their connected accounts and integration settings
 */
'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  X, 
  FolderOpen, 
  Mail, 
  Shield,
  Clock,
  Info
} from 'lucide-react';
import { useGoogleIntegration } from '@/hooks/useGoogleIntegration';
import { IntegrationBanner } from '@/components/integrations/IntegrationBanner';
import { formatDistanceToNow } from 'date-fns';

export default function IntegrationsPage() {
  const {
    status,
    isLoading,
    connect,
    disconnect,
    refreshToken,
    isConnecting,
    isDisconnecting,
    isRefreshing,
    needsRefresh
  } = useGoogleIntegration();

  const isConnected = status?.connected || false;
  const scopes = status?.scopes || [];
  const expiresAt = status?.expires_at ? new Date(status.expires_at) : null;

  // Gmail scopes no longer used - handled via service account
  const hasDriveScope = scopes.some(scope => 
    scope.includes('drive.file') || scope.includes('auth/drive')
  );
  const hasEmailAutomation = isConnected; // Email automations available when Google is connected

  return (
    <div className="container max-w-4xl mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Connect external services to import files and export results
        </p>
      </div>

      {/* Integration banner */}
      <IntegrationBanner />

      {/* Google Integration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="h-6 w-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <CardTitle>Google Services</CardTitle>
                <CardDescription>
                  Connect Google Drive for file import and email automations
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Not Connected
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isConnected ? (
            <>
              {/* Connection details */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Connected Services</h4>
                  <div className="flex gap-2">
                    {hasDriveScope && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        Google Drive
                      </Badge>
                    )}
                    {hasEmailAutomation && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        Email Automations
                      </Badge>
                    )}
                  </div>
                </div>

                {expiresAt && (
                  <div>
                    <h4 className="font-medium mb-2">Token Status</h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {needsRefresh ? (
                        <span className="text-amber-600">
                          Expired {formatDistanceToNow(expiresAt, { addSuffix: true })}
                        </span>
                      ) : (
                        <span>
                          Expires {formatDistanceToNow(expiresAt, { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {needsRefresh && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Your Google access has expired. Please refresh your connection to continue using Google services.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  onClick={refreshToken}
                  disabled={isRefreshing}
                  variant="outline"
                >
                  {isRefreshing ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh Connection
                    </>
                  )}
                </Button>
                
                <Button
                  onClick={() => connect('drive')}
                  disabled={isConnecting}
                  variant="outline"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Reconnecting...
                    </>
                  ) : (
                    <>
                      <Settings className="mr-2 h-4 w-4" />
                      Reconnect Drive
                    </>
                  )}
                </Button>

                <Button
                  onClick={disconnect}
                  disabled={isDisconnecting}
                  variant="destructive"
                >
                  {isDisconnecting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Disconnecting...
                    </>
                  ) : (
                    <>
                      <X className="mr-2 h-4 w-4" />
                      Disconnect
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Connection options */}
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Available Services</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <span>Google Drive - Import files and export results</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>Email Automations - Process emails sent to document@cpaautomation.ai</span>
                    </div>
                  </div>
                </div>

                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    CPAAutomation only requests access to files you explicitly select and uses a service account for email processing. 
                    We cannot access your personal files or emails without permission.
                  </AlertDescription>
                </Alert>
              </div>

              <Separator />

              {/* Connect options */}
              <div className="space-y-3">
                <Button
                  onClick={() => connect('combined')}
                  disabled={isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Connect Google Drive & Email Automations
                    </>
                  )}
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => connect('drive')}
                    disabled={isConnecting}
                    variant="outline"
                  >
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Drive Only
                  </Button>
                  <Button
                    onClick={() => connect('drive')}
                    disabled={isConnecting}
                    variant="outline"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Email Automations Only
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Email Automation Information */}
      {isConnected && hasEmailAutomation && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Mail className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>Email Automation Setup</CardTitle>
                <CardDescription>
                  How to use email-based document processing
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">📧 Email Address for Automations</h4>
              <p className="text-blue-800 font-mono text-lg mb-2">document@cpaautomation.ai</p>
              <p className="text-sm text-blue-700">
                Send or forward emails with PDF attachments to this address to trigger your automations.
              </p>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium">How it works:</h4>
              <ol className="list-decimal pl-6 space-y-1 text-sm text-gray-600">
                <li>Send emails with PDF attachments to document@cpaautomation.ai</li>
                <li>System matches your sender email to your Google account</li>
                <li>Emails are filtered based on your automation rules</li>
                <li>Matching attachments are automatically processed</li>
                <li>Results are exported to your configured destinations</li>
              </ol>
            </div>
            
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Make sure to send emails from the same email address ({status?.email || 'your Google account email'}) 
                that you used to connect your Google integration.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Future integrations placeholder */}
      <Card className="opacity-60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="#0078D4">
                  <path d="M21.53 4.306v15.363A.631.631 0 0 1 20.9 20.3H3.1a.631.631 0 0 1-.63-.631V4.306a.631.631 0 0 1 .63-.631H20.9a.631.631 0 0 1 .63.631z"/>
                  <path fill="#fff" d="M10.79 15.906v-3.574h-.79v3.574h-.79v-3.574h-.79v3.574H7.63v-4.363h3.95v4.363h-.79zm2.37 0v-4.363h.79v3.574h1.58v.789h-2.37zm2.37 0v-4.363h.79v4.363h-.79z"/>
                </svg>
              </div>
              <div>
                <CardTitle>Microsoft 365</CardTitle>
                <CardDescription>
                  OneDrive, Outlook, and SharePoint integration
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4" />
            <span>Microsoft 365 integration will be available in a future update</span>
          </div>
        </CardContent>
      </Card>

      {/* Security notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          <strong>Security:</strong> All OAuth tokens are encrypted and stored securely. 
          CPAAutomation only requests the minimum permissions needed and cannot access your data 
          without explicit authorization for each service.
        </AlertDescription>
      </Alert>
    </div>
  );
}
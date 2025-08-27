/**
 * Integration banner component for showing Google connection status
 * and providing quick access to connect/disconnect
 */
import React from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useGoogleIntegration } from '@/hooks/useGoogleIntegration';
import { cn } from '@/lib/utils';

interface IntegrationBannerProps {
  className?: string;
  showOnlyWhenDisconnected?: boolean;
  compact?: boolean;
}

export function IntegrationBanner({ 
  className, 
  showOnlyWhenDisconnected = false,
  compact = false 
}: IntegrationBannerProps) {
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

  // Don't show if loading
  if (isLoading) {
    return null;
  }

  // Don't show if connected and showOnlyWhenDisconnected is true
  if (showOnlyWhenDisconnected && status?.connected) {
    return null;
  }

  const isConnected = status?.connected || false;
  const hasExpiredToken = needsRefresh;

  // Determine banner variant and content
  let variant: 'default' | 'destructive' = 'default';
  let icon = <CheckCircle className="h-4 w-4" />;
  let title = '';
  let description = '';
  let actions: React.ReactNode = null;

  if (!isConnected) {
    variant = 'default';
    icon = <AlertCircle className="h-4 w-4 text-blue-500" />;
    title = 'Connect Google Services';
    description = 'Connect your Google account to import files from Drive and Gmail attachments.';
    actions = (
      <Button
        onClick={() => connect('drive')}
        disabled={isConnecting}
        size={compact ? "sm" : "default"}
        className="ml-auto"
      >
        {isConnecting ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          'Connect Google'
        )}
      </Button>
    );
  } else if (hasExpiredToken) {
    variant = 'destructive';
    icon = <AlertCircle className="h-4 w-4" />;
    title = 'Google Connection Expired';
    description = 'Your Google access has expired. Please refresh your connection to continue importing files.';
    actions = (
      <div className="flex gap-2 ml-auto">
        <Button
          onClick={refreshToken}
          disabled={isRefreshing}
          size={compact ? "sm" : "default"}
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
              Refresh
            </>
          )}
        </Button>
        <Button
          onClick={disconnect}
          disabled={isDisconnecting}
          size={compact ? "sm" : "default"}
          variant="destructive"
        >
          {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
        </Button>
      </div>
    );
  } else {
    // Connected and working
    if (compact) {
      return (
        <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>Google connected</span>
          <Badge variant="secondary" className="text-xs">
            {status?.scopes?.length || 0} service{(status?.scopes?.length || 0) !== 1 ? 's' : ''}
          </Badge>
        </div>
      );
    }

    title = 'Google Connected';
    const hasDriveAccess = status?.scopes?.some(scope => 
      scope.includes('drive.file') || scope.includes('auth/drive')
    );
    // Gmail access now handled via central mailbox - users no longer grant Gmail permissions
    const hasEmailAutomation = true; // Always available with Google integration
    description = `Connected services: ${hasDriveAccess ? 'Drive' : ''} ${hasEmailAutomation ? 'Email Automations' : ''}`.trim();
    actions = (
      <div className="flex gap-2 ml-auto">
        <Button
          onClick={refreshToken}
          disabled={isRefreshing}
          size="sm"
          variant="outline"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        <Button
          onClick={disconnect}
          disabled={isDisconnecting}
          size="sm"
          variant="outline"
        >
          <X className="mr-2 h-4 w-4" />
          Disconnect
        </Button>
      </div>
    );
  }

  if (compact && isConnected && !hasExpiredToken) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span>Google connected</span>
        <Badge variant="secondary" className="text-xs">
          {status?.scopes.length || 0} service{(status?.scopes.length || 0) !== 1 ? 's' : ''}
        </Badge>
      </div>
    );
  }

  return (
    <Alert variant={variant} className={cn("", className)}>
      <div className="flex items-center gap-3 w-full">
        {icon}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{title}</div>
          {!compact && (
            <AlertDescription className="mt-1">
              {description}
            </AlertDescription>
          )}
        </div>
        {actions}
      </div>
    </Alert>
  );
}

// Compact version for use in smaller spaces
export function CompactIntegrationStatus({ className }: { className?: string }) {
  return <IntegrationBanner className={className} compact />;
}

// Version that only shows when disconnected (for upload pages)
export function IntegrationPrompt({ className }: { className?: string }) {
  return <IntegrationBanner className={className} showOnlyWhenDisconnected />;
}
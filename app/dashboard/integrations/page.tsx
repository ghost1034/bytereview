/**
 * Integrations settings page
 * Allows users to manage their connected accounts and integration settings
 */
'use client'

import {
  CheckCircle,
  FolderOpen,
  Info,
  Mail,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  X,
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconTile } from '@/components/ui/icon-tile'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { Separator } from '@/components/ui/separator'
import { useGoogleIntegration } from '@/hooks/useGoogleIntegration'
import { IntegrationBanner } from '@/components/integrations/IntegrationBanner'

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function MicrosoftLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#0078D4" aria-hidden>
      <path d="M21.53 4.306v15.363A.631.631 0 0 1 20.9 20.3H3.1a.631.631 0 0 1-.63-.631V4.306a.631.631 0 0 1 .63-.631H20.9a.631.631 0 0 1 .63.631z" />
      <path
        fill="#fff"
        d="M10.79 15.906v-3.574h-.79v3.574h-.79v-3.574h-.79v3.574H7.63v-4.363h3.95v4.363h-.79zm2.37 0v-4.363h.79v3.574h1.58v.789h-2.37zm2.37 0v-4.363h.79v4.363h-.79z"
      />
    </svg>
  )
}

export default function IntegrationsPage() {
  const {
    status,
    connect,
    disconnect,
    isConnecting,
    isDisconnecting,
  } = useGoogleIntegration()

  const isConnected = status?.connected || false
  const scopes = status?.scopes || []
  const hasDriveScope = scopes.some(
    (scope) =>
      scope.includes('drive.file') || scope.includes('auth/drive'),
  )

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integrations"
        description="Connect external services to import files and export results."
      />

      <IntegrationBanner />

      {/* Google integration */}
      <Section
        variant="card"
        title={
          <div className="flex items-center gap-3">
            <IconTile size="lg" tone="neutral" className="bg-surface ring-border">
              <GoogleLogo className="size-5" />
            </IconTile>
            <div className="space-y-0.5">
              <span className="block text-base font-semibold text-foreground">
                Google services
              </span>
              <span className="block text-xs font-normal text-foreground-muted">
                Connect Google Drive for file import and export
              </span>
            </div>
          </div>
        }
        action={
          isConnected ? (
            <Badge
              variant="outline"
              className="border-success/20 bg-success-soft text-success"
            >
              <CheckCircle className="mr-1 size-3" aria-hidden />
              Connected
            </Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )
        }
      >
        <div className="space-y-5">
          {isConnected ? (
            <>
              <div>
                <h4 className="mb-2 text-sm font-medium text-foreground">
                  Connected services
                </h4>
                <div className="flex flex-wrap gap-2">
                  {hasDriveScope && (
                    <Badge variant="outline" className="gap-1">
                      <FolderOpen className="size-3" aria-hidden />
                      Google Drive
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => connect('drive')}
                  disabled={isConnecting}
                  variant="outline"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw
                        className="mr-1.5 size-4 animate-spin"
                        aria-hidden
                      />
                      Reconnecting…
                    </>
                  ) : (
                    <>
                      <SettingsIcon className="mr-1.5 size-4" aria-hidden />
                      Reconnect
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
                      <RefreshCw
                        className="mr-1.5 size-4 animate-spin"
                        aria-hidden
                      />
                      Disconnecting…
                    </>
                  ) : (
                    <>
                      <X className="mr-1.5 size-4" aria-hidden />
                      Disconnect
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <h4 className="mb-2 text-sm font-medium text-foreground">
                  Available services
                </h4>
                <div className="flex items-center gap-2 text-sm text-foreground-muted">
                  <FolderOpen className="size-4 text-foreground-subtle" aria-hidden />
                  <span>Google Drive — import files and export results</span>
                </div>
              </div>

              <Alert>
                <Shield className="size-4" />
                <AlertDescription>
                  CPAAutomation only requests access to files you explicitly
                  select and uses a service account for email processing. We
                  cannot access your personal files or emails without permission.
                </AlertDescription>
              </Alert>

              <Separator />

              <Button
                onClick={() => connect('drive')}
                disabled={isConnecting}
                className="w-full"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw
                      className="mr-1.5 size-4 animate-spin"
                      aria-hidden
                    />
                    Connecting…
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-1.5 size-4" aria-hidden />
                    Connect Google Drive
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </Section>

      {/* Email automation info */}
      <Section
        variant="card"
        title={
          <div className="flex items-center gap-3">
            <IconTile icon={Mail} tone="brand" size="lg" />
            <div className="space-y-0.5">
              <span className="block text-base font-semibold text-foreground">
                Email automation setup
              </span>
              <span className="block text-xs font-normal text-foreground-muted">
                How to use email-based document processing
              </span>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/15 bg-primary-soft p-4">
            <h4 className="mb-2 text-sm font-medium text-primary-soft-foreground">
              Email address for automations
            </h4>
            <p className="mb-2 font-mono text-base text-primary-soft-foreground">
              document@cpaautomation.ai
            </p>
            <p className="text-xs text-primary-soft-foreground/80">
              Send or forward emails with PDF attachments to this address to
              trigger your automations.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">
              How it works
            </h4>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground-muted">
              <li>Send emails with PDF attachments to document@cpaautomation.ai</li>
              <li>System matches your sender email to your user account</li>
              <li>Emails are filtered based on your automation rules</li>
              <li>Matching attachments are automatically processed</li>
              <li>Results are exported to your configured destinations</li>
            </ol>
          </div>

          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              <strong>Important:</strong> Send emails from the same email
              address as your account to ensure proper automation matching.
            </AlertDescription>
          </Alert>
        </div>
      </Section>

      {/* Microsoft 365 placeholder */}
      <Section
        variant="card"
        className="opacity-70"
        title={
          <div className="flex items-center gap-3">
            <IconTile size="lg" tone="neutral" className="bg-surface ring-border">
              <MicrosoftLogo className="size-5" />
            </IconTile>
            <div className="space-y-0.5">
              <span className="block text-base font-semibold text-foreground">
                Microsoft 365
              </span>
              <span className="block text-xs font-normal text-foreground-muted">
                OneDrive, Outlook, and SharePoint integration
              </span>
            </div>
          </div>
        }
        action={<Badge variant="secondary">Coming soon</Badge>}
      >
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Info className="size-4" aria-hidden />
          <span>Microsoft 365 integration will be available in a future update.</span>
        </div>
      </Section>

      {/* Security notice */}
      <Alert>
        <Shield className="size-4" />
        <AlertDescription>
          <strong>Security:</strong> All OAuth tokens are encrypted and stored
          securely. CPAAutomation only requests the minimum permissions needed
          and cannot access your data without explicit authorization for each
          service.
        </AlertDescription>
      </Alert>
    </div>
  )
}

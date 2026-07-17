'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { apiClient } from '@/lib/api'
import { useConnectorProvider, useCreateConnectorConnection } from '@/hooks/useConnector'
import type { ConnectorCredentialField } from '@/lib/connector-types'

const OAUTH_POLL_INTERVAL_MS = 2000
const OAUTH_POLL_TIMEOUT_MS = 5 * 60 * 1000

interface ConnectDialogProps {
  service: string | null
  onOpenChange: (open: boolean) => void
}

function CredentialForm({
  fields,
  values,
  onChange,
}: {
  fields: ConnectorCredentialField[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`cred-${field.key}`}>
            {field.label || field.key}
            {field.required && <span className="text-destructive"> *</span>}
          </Label>
          <Input
            id={`cred-${field.key}`}
            type={field.secret ? 'password' : 'text'}
            autoComplete="off"
            placeholder={field.placeholder || undefined}
            value={values[field.key] ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
          {field.description && (
            <p className="text-xs text-foreground-muted">{field.description}</p>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Connect flow for one provider. API-key / custom-credential providers get a
 * dynamic form built from the runtime's field schema (values are sent once and
 * never read back). OAuth providers open the provider consent screen in a
 * popup and poll the pending connection until the grant lands.
 */
export function ConnectDialog({ service, onOpenChange }: ConnectDialogProps) {
  const queryClient = useQueryClient()
  const { data: provider, isLoading } = useConnectorProvider(service)
  const createConnection = useCreateConnectorConnection()

  const [values, setValues] = useState<Record<string, string>>({})
  const [oauthState, setOauthState] = useState<'idle' | 'waiting' | 'done' | 'error' | 'timeout'>('idle')
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [])

  useEffect(() => {
    // Reset state when the dialog switches provider or closes.
    setValues({})
    setOauthState('idle')
    stopPolling()
    return stopPolling
  }, [service, stopPolling])

  const authTabs = useMemo(() => {
    if (!provider) return []
    const tabs: Array<{ id: string; label: string }> = []
    if (provider.auth_types.includes('oauth2')) {
      tabs.push({ id: 'oauth2', label: 'Sign in (OAuth)' })
    }
    if (provider.auth_types.includes('api_key')) tabs.push({ id: 'api_key', label: 'API key' })
    if (provider.auth_types.includes('custom_credential')) {
      tabs.push({ id: 'custom_credential', label: 'Credentials' })
    }
    if (provider.auth_types.includes('no_auth') && tabs.length === 0) {
      tabs.push({ id: 'no_auth', label: 'Enable' })
    }
    return tabs
  }, [provider])

  const startOAuthPolling = useCallback(
    (connectionId: string) => {
      setOauthState('waiting')
      const startedAt = Date.now()
      stopPolling()
      pollTimer.current = setInterval(async () => {
        if (Date.now() - startedAt > OAUTH_POLL_TIMEOUT_MS) {
          stopPolling()
          setOauthState('timeout')
          return
        }
        try {
          const result = await apiClient.getConnectorConnection(connectionId)
          if (result.connection.status === 'active') {
            stopPolling()
            setOauthState('done')
            queryClient.invalidateQueries({ queryKey: ['connector-connections'] })
            queryClient.invalidateQueries({ queryKey: ['connector-catalog'] })
            setTimeout(() => onOpenChange(false), 1200)
          } else if (result.connection.status === 'error') {
            stopPolling()
            setOauthState('error')
          }
        } catch {
          // transient — keep polling until timeout
        }
      }, OAUTH_POLL_INTERVAL_MS)
    },
    [onOpenChange, queryClient, stopPolling],
  )

  const handleConnect = async (authType: string) => {
    if (!service) return
    const result = await createConnection.mutateAsync({
      service,
      auth_type: authType,
      values: authType === 'oauth2' || authType === 'no_auth' ? undefined : values,
    })
    if (authType === 'oauth2' && result.authorization_url) {
      window.open(result.authorization_url, 'cpaa-oauth', 'width=600,height=760')
      startOAuthPolling(result.connection.id)
    } else {
      onOpenChange(false)
    }
  }

  const fieldsFor = (authType: string): ConnectorCredentialField[] => {
    if (!provider) return []
    if (authType === 'api_key') return provider.api_key_fields
    if (authType === 'custom_credential') return provider.custom_credential_fields
    return []
  }

  const requiredFilled = (authType: string) =>
    fieldsFor(authType)
      .filter((f) => f.required)
      .every((f) => (values[f.key] ?? '').trim().length > 0)

  return (
    <Dialog open={!!service} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {provider?.display_name || service}</DialogTitle>
          <DialogDescription>
            {provider?.categories?.length
              ? provider.categories.join(' · ')
              : 'Connect this service to use it across CPAAutomation and your Claw agents.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !provider ? (
          <div className="flex items-center justify-center py-8 text-foreground-muted">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            Loading provider details…
          </div>
        ) : oauthState !== 'idle' ? (
          <div className="space-y-4 py-2">
            {oauthState === 'waiting' && (
              <Alert>
                <Loader2 className="size-4 animate-spin" />
                <AlertDescription>
                  Finish signing in to {provider.display_name} in the popup window. This
                  dialog updates automatically once access is granted.
                </AlertDescription>
              </Alert>
            )}
            {oauthState === 'done' && (
              <Alert>
                <ShieldCheck className="size-4" />
                <AlertDescription>Connected successfully.</AlertDescription>
              </Alert>
            )}
            {(oauthState === 'error' || oauthState === 'timeout') && (
              <Alert variant="destructive">
                <AlertDescription>
                  {oauthState === 'timeout'
                    ? 'Timed out waiting for authorization. Close this dialog and try again.'
                    : 'Authorization failed. Close this dialog and try again.'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : authTabs.length === 0 ? (
          <Alert>
            <AlertDescription>
              This provider cannot be connected yet. OAuth access requires CPAAutomation to
              register an app with the provider — contact support to request it.
            </AlertDescription>
          </Alert>
        ) : (
          <Tabs defaultValue={authTabs[0].id}>
            {authTabs.length > 1 && (
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${authTabs.length}, 1fr)` }}>
                {authTabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            )}

            {authTabs.map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="space-y-4 pt-2">
                {tab.id === 'oauth2' ? (
                  provider.oauth_configured ? (
                    <>
                      <p className="text-sm text-foreground-muted">
                        You&apos;ll be sent to {provider.display_name} to approve access. Credentials
                        are stored encrypted and never shared with your browser or agents.
                      </p>
                      <Button
                        className="w-full"
                        onClick={() => handleConnect('oauth2')}
                        disabled={createConnection.isPending}
                      >
                        {createConnection.isPending ? (
                          <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                        ) : (
                          <ExternalLink className="mr-1.5 size-4" aria-hidden />
                        )}
                        Continue to {provider.display_name}
                      </Button>
                    </>
                  ) : (
                    <Alert>
                      <AlertDescription>
                        Sign-in with {provider.display_name} isn&apos;t available yet — CPAAutomation
                        has not registered an OAuth app for it. Use an API key if available, or
                        contact support to request OAuth access.
                      </AlertDescription>
                    </Alert>
                  )
                ) : tab.id === 'no_auth' ? (
                  <Button
                    className="w-full"
                    onClick={() => handleConnect('no_auth')}
                    disabled={createConnection.isPending}
                  >
                    Enable {provider.display_name}
                  </Button>
                ) : (
                  <>
                    <CredentialForm
                      fields={fieldsFor(tab.id)}
                      values={values}
                      onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
                    />
                    <Button
                      className="w-full"
                      onClick={() => handleConnect(tab.id)}
                      disabled={createConnection.isPending || !requiredFilled(tab.id)}
                    >
                      {createConnection.isPending ? (
                        <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
                      ) : (
                        <KeyRound className="mr-1.5 size-4" aria-hidden />
                      )}
                      Connect
                    </Button>
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        <DialogFooter className="sm:justify-start">
          <p className="text-xs text-foreground-muted">
            {provider ? `${provider.action_count} actions available after connecting.` : ''}
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

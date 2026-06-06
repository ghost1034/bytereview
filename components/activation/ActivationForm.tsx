'use client'

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Cloud,
  Copy,
  Download,
  KeyRound,
  Loader2,
  Monitor,
  ShieldCheck,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Section } from '@/components/ui/section'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp'
import { useToast } from '@/hooks/use-toast'
import { apiClient, ApiError } from '@/lib/api'
import type { ActivationStatus } from '@/lib/api'

const ACCOUNTINGCLAW_IMAGE =
  process.env.NEXT_PUBLIC_ACCOUNTINGCLAW_IMAGE ||
  'cpaautomation/accountingclaw-hermes:latest'

const HERMES_DESKTOP_DOWNLOADS = {
  mac: 'https://hermes-assets.nousresearch.com/Hermes-Setup.dmg',
  windows: 'https://hermes-assets.nousresearch.com/Hermes-Setup.exe',
}

function runCommand(activationKey: string): string {
  return [
    'docker run -d \\',
    '  --platform linux/amd64 \\',
    '  --name accountingclaw \\',
    '  --restart unless-stopped \\',
    '  -v ~/.accountingclaw:/opt/data \\',
    `  -e CPAA_ACTIVATION_KEY="${activationKey}" \\`,
    '  -e OPENROUTER_API_KEY="sk-or-..." \\',
    '  -e API_SERVER_ENABLED=true \\',
    '  -e API_SERVER_HOST=0.0.0.0 \\',
    '  -e API_SERVER_KEY="change-this-api-key" \\',
    '  -p 127.0.0.1:8642:8642 \\',
    `  ${ACCOUNTINGCLAW_IMAGE} gateway run`,
  ].join('\n')
}

function desktopInstallBashCommand(activationKey: string): string {
  return `curl -fsSL https://cpaautomation.ai/install-accountingclaw.sh | CPAA_ACTIVATION_KEY="${activationKey}" bash`
}

function desktopInstallPsCommand(activationKey: string): string {
  return `$env:CPAA_ACTIVATION_KEY="${activationKey}"; iwr https://cpaautomation.ai/install-accountingclaw.ps1 -UseBasicParsing | iex`
}

function installTypeLabel(installType: string | null | undefined): string {
  if (installType === 'desktop') return 'your desktop install'
  if (installType === 'docker') return 'your cloud (Docker) install'
  return 'a container'
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }}
    >
      {copied ? (
        <Check className="size-4 text-success" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      {copied ? 'Copied' : label}
    </Button>
  )
}

export function ActivationForm() {
  const { toast } = useToast()

  const [status, setStatus] = useState<ActivationStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // The full key, only available immediately after a successful activation.
  const [issuedKey, setIssuedKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .getActivation()
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch((err) => {
        console.error('Failed to load activation status:', err)
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (code.length !== 6 || submitting) return

    setSubmitting(true)
    try {
      const result = await apiClient.activate(code)

      if (result.activation_key) {
        setIssuedKey(result.activation_key)
        toast({
          title: 'Activation successful',
          description: 'Save your key now — it will not be shown again.',
        })
      } else if (result.already_active) {
        toast({
          title: 'Already activated',
          description:
            'You already have an active key. Use the key you saved previously, or revoke and re-activate if it was lost.',
        })
      }

      // Refresh status so the UI reflects the current state.
      setStatus(await apiClient.getActivation())
      setCode('')
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 403
            ? 'Invalid activation code. Double-check the six digits we gave you.'
            : err.status === 429
              ? 'Too many attempts. Please wait a few minutes and try again.'
              : err.message
          : 'Something went wrong. Please try again.'
      toast({
        title: 'Activation failed',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const hasActiveKey = status?.has_key ?? false

  return (
    <div className="space-y-6">
      {status?.revoked && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-semibold text-destructive">Your activation key was revoked</p>
            <p className="mt-1 text-foreground-muted">
              Key {status.key_prefix} is no longer valid. Enter your activation code below to
              issue a new one.
            </p>
          </div>
        </div>
      )}

      {hasActiveKey ? (
        <Section
          variant="card"
          title={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              AccountingClaw activated
            </span>
          }
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground-muted">Your key</Label>
              <p className="font-mono text-sm text-foreground">{status?.key_prefix}</p>
            </div>
            <p className="text-sm text-foreground-muted">
              For security, the full key is only shown once at activation. If you saved it, pass
              it to your Docker container as{' '}
              <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">
                CPAA_ACTIVATION_KEY
              </code>{' '}
              (cloud digital worker), or run the desktop installer with it to add
              AccountingClaw to Hermes Desktop (desktop digital worker). If you lost it, revoke
              this key (contact us) and re-activate to issue a new one.
            </p>
            {status?.last_resolved_at && (
              <p className="text-xs text-foreground-subtle">
                Last used by {installTypeLabel(status.last_resolved_install_type)} on{' '}
                {new Date(status.last_resolved_at).toLocaleString()}.
              </p>
            )}
          </div>
        </Section>
      ) : (
        <Section
          variant="card"
          title={
            <span className="inline-flex items-center gap-2">
              <KeyRound className="size-4 text-foreground-muted" aria-hidden />
              Enter your activation code
            </span>
          }
          description="Contact us to receive a six-digit activation code, then enter it below to issue your personal AccountingClaw key."
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="activation-code">Activation code</Label>
              <InputOTP
                id="activation-code"
                maxLength={6}
                value={code}
                onChange={setCode}
                disabled={submitting || loadingStatus}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button type="submit" disabled={code.length !== 6 || submitting || loadingStatus}>
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {submitting ? 'Activating...' : 'Activate'}
            </Button>
          </form>
        </Section>
      )}

      {issuedKey && (
        <Section
          variant="card"
          className="border-primary/30"
          title={
            <span className="inline-flex items-center gap-2">
              <KeyRound className="size-4 text-primary" aria-hidden />
              Your personal activation key
            </span>
          }
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <span className="font-semibold">Save this now.</span> For your security it will
                not be shown again. If you lose it, revoke and re-activate.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground-muted">Activation key</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border border-border bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
                  {issuedKey}
                </code>
                <CopyButton value={issuedKey} label="Copy key" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground-muted">
                Run AccountingClaw
              </Label>
              <Tabs defaultValue="cloud">
                <TabsList className="grid h-auto w-full grid-cols-2">
                  <TabsTrigger value="cloud" className="gap-2 py-2">
                    <Cloud className="size-4" aria-hidden />
                    Cloud (Docker)
                  </TabsTrigger>
                  <TabsTrigger value="desktop" className="gap-2 py-2">
                    <Monitor className="size-4" aria-hidden />
                    Desktop
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="cloud" className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs text-foreground-muted">
                      Run the AccountingClaw Docker image with your key on any server or cloud.
                    </p>
                    <CopyButton value={runCommand(issuedKey)} label="Copy command" />
                  </div>
                  <pre className="overflow-x-auto rounded-md border border-border bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                    <code>{runCommand(issuedKey)}</code>
                  </pre>
                </TabsContent>

                <TabsContent value="desktop" className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs text-foreground-muted">
                      First install the Hermes Desktop app, then run the installer for your
                      platform — your key is already filled in.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <a href={HERMES_DESKTOP_DOWNLOADS.mac}>
                          <Download className="mr-1.5 size-4" aria-hidden />
                          Hermes Desktop for Mac
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a href={HERMES_DESKTOP_DOWNLOADS.windows}>
                          <Download className="mr-1.5 size-4" aria-hidden />
                          Hermes Desktop for Windows
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <Label className="text-xs font-medium text-foreground-muted">
                        macOS / Linux
                      </Label>
                      <CopyButton
                        value={desktopInstallBashCommand(issuedKey)}
                        label="Copy command"
                      />
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                      <code>{desktopInstallBashCommand(issuedKey)}</code>
                    </pre>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <Label className="text-xs font-medium text-foreground-muted">
                        Windows (PowerShell)
                      </Label>
                      <CopyButton
                        value={desktopInstallPsCommand(issuedKey)}
                        label="Copy command"
                      />
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                      <code>{desktopInstallPsCommand(issuedKey)}</code>
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

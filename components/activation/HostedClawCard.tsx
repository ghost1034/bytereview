'use client'

import { useCallback, useEffect, useState } from 'react'
import { Cloud, Loader2, MessageSquare, RotateCcw, Save, Square, Trash2, Unlink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Section } from '@/components/ui/section'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { apiClient, ApiError, type HostedClawConfig, type HostedClawStatus } from '@/lib/api'

export function HostedClawCard() {
  const { toast } = useToast()
  const [status, setStatus] = useState<HostedClawStatus | null>(null)
  const [config, setConfig] = useState<HostedClawConfig | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const next = await apiClient.getHostedClawStatus()
    setStatus(next)
    setConfig(next.config)
  }, [])

  useEffect(() => {
    let cancelled = false
    const searchParams = new URLSearchParams(window.location.search)
    const linkToken = searchParams.get('hosted_link')
    const oauthLinked = searchParams.get('slack_linked') === '1'
    const load = async () => {
      try {
        if (linkToken) {
          await apiClient.consumeHostedSlackLink(linkToken)
          const url = new URL(window.location.href)
          url.searchParams.delete('hosted_link')
          window.history.replaceState({}, '', url)
          toast({ title: 'Slack linked', description: 'You can now DM the app or mention it in an invited Slack channel.' })
        } else if (oauthLinked) {
          const url = new URL(window.location.href)
          url.searchParams.delete('slack_linked')
          window.history.replaceState({}, '', url)
          toast({ title: 'Slack linked', description: 'You can now DM the app or mention it in an invited Slack channel.' })
        }
        const next = await apiClient.getHostedClawStatus()
        if (!cancelled) {
          setStatus(next)
          setConfig(next.config)
        }
      } catch (error) {
        if (!cancelled) toast({ title: 'Hosted Claw', description: error instanceof ApiError ? error.message : 'Could not load hosted settings.', variant: 'destructive' })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [toast])

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await action()
      await reload()
      toast({ title: success })
    } catch (error) {
      toast({ title: 'Hosted Claw update failed', description: error instanceof ApiError ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return <Section variant="card" title="Hosted Slack"><Loader2 className="size-5 animate-spin text-foreground-muted" aria-label="Loading hosted Claw" /></Section>
  }

  return (
    <Section
      variant="card"
      title={<span className="inline-flex items-center gap-2"><Cloud className="size-4 text-primary" aria-hidden />Hosted Slack</span>}
      description="Run an isolated AccountingClaw or LegalClaw worker by DM or by mentioning the CPAAutomation Slack app in an invited channel. Desktop and self-hosted installs remain separate."
    >
      {!status.feature_enabled ? (
        <p className="text-sm text-foreground-muted">Hosted Slack is not currently available.</p>
      ) : !status.entitled ? (
        <p className="text-sm text-foreground-muted">Hosted Slack is unavailable for this account.</p>
      ) : config ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted/40 p-4">
            <div>
              <p className="text-sm font-medium">{status.linked ? `Linked to ${status.workspace_name || 'Slack'}` : 'Slack is not linked'}</p>
              <p className="mt-1 text-xs text-foreground-muted">Runtime: {status.runtime_status} · {status.usage_turns} turns · ${Number(status.usage_cost_usd).toFixed(2)} used {Number(status.monthly_budget_usd) > 0 ? `of $${Number(status.monthly_budget_usd).toFixed(2)} this month` : '(no monthly cap)'}</p>
            </div>
            {status.linked ? (
              <div className="flex flex-wrap gap-2">
                {status.slack_reauthorization_required ? (
                  <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { const result = await apiClient.startHostedSlackInstall(); window.location.assign(result.authorize_url) } catch (error) { setBusy(false); toast({ title: 'Could not reconnect Slack', description: error instanceof ApiError ? error.message : 'Please try again.', variant: 'destructive' }) } }}><MessageSquare className="size-4" aria-hidden />Reconnect for channel mentions</Button>
                ) : null}
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => apiClient.unlinkHostedSlack(), 'Slack unlinked')}><Unlink className="size-4" aria-hidden />Unlink</Button>
              </div>
            ) : (
              <Button disabled={busy} onClick={async () => { setBusy(true); try { const result = await apiClient.startHostedSlackInstall(); window.location.assign(result.authorize_url) } catch (error) { setBusy(false); toast({ title: 'Could not open Slack', description: error instanceof ApiError ? error.message : 'Please try again.', variant: 'destructive' }) } }}><MessageSquare className="size-4" aria-hidden />Add to Slack</Button>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Active product</Label>
              <Select value={config.active_product} onValueChange={(value: HostedClawConfig['active_product']) => setConfig({ ...config, active_product: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{status.allowed_products.map((product) => <SelectItem key={product} value={product}>{product === 'accountingclaw' ? 'AccountingClaw' : 'LegalClaw'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Approved model</Label>
              <Select value={config.model_alias} onValueChange={(model_alias) => setConfig({ ...config, model_alias })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{status.allowed_model_aliases.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hosted-timezone">Timezone</Label>
            <Input id="hosted-timezone" value={config.timezone} onChange={(event) => setConfig({ ...config, timezone: event.target.value })} placeholder="America/Los_Angeles" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hosted-instructions">Personal instructions</Label>
            <Textarea id="hosted-instructions" value={config.personal_instructions} maxLength={8000} rows={5} onChange={(event) => setConfig({ ...config, personal_instructions: event.target.value })} placeholder="Preferences the managed worker should follow…" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div><Label htmlFor="hosted-memory">Memory</Label><p className="mt-1 text-xs text-foreground-muted">Persist managed memory inside this product’s isolated tenant volume.</p></div>
            <Switch id="hosted-memory" checked={config.memory_enabled} onCheckedChange={(memory_enabled) => setConfig({ ...config, memory_enabled })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => run(() => apiClient.updateHostedClawConfig(config), 'Hosted settings saved')}><Save className="size-4" aria-hidden />Save settings</Button>
            <Button variant="outline" disabled={busy} onClick={() => run(() => apiClient.newHostedClawSession(), 'The next DM will start a fresh session')}><RotateCcw className="size-4" aria-hidden />New DM session</Button>
            <Button variant="outline" disabled={busy} onClick={() => run(() => apiClient.stopHostedClaw(), 'Hosted Claw stopped')}><Square className="size-4" aria-hidden />Stop</Button>
          </div>
          <div className="border-t border-border pt-5">
            <Button variant="outline" className="mr-2" disabled={busy} onClick={() => { if (window.confirm('Reset this product’s hosted history, memory, and files?')) void run(() => apiClient.resetHostedClawProduct(), 'Active product reset requested') }}><RotateCcw className="size-4" aria-hidden />Reset product data</Button>
            <Button variant="destructive" disabled={busy} onClick={() => { if (window.confirm('Delete all hosted conversations, memory, sessions, and active files? This cannot be undone.')) void run(() => apiClient.deleteHostedClaw(), 'Hosted Claw data deleted') }}><Trash2 className="size-4" aria-hidden />Delete hosted service</Button>
            <p className="mt-2 text-xs text-foreground-muted">Deletes active hosted state immediately. Encrypted backup blocks may remain until snapshot expiry, up to 14 days.</p>
          </div>
        </div>
      ) : null}
    </Section>
  )
}

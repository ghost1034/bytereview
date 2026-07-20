'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, KeyRound, Link2, Palette, Settings2, ShieldCheck, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  useEsignAdminOverview, useEsignAdminSettings, useEsignBrands, useEsignContext,
  useEsignFirmWebhooks, useEsignPermissionProfiles, useEsignWebhookDeliveries,
} from '@/hooks/useEnvelopes'
import { apiClient } from '@/lib/api'
import { cn } from '@/lib/utils'

const sections = ['Overview', 'Users & permissions', 'Branding', 'Settings', 'Webhooks', 'Audit'] as const
type Section = typeof sections[number]

function Metric({ label, value }: { label: string; value?: number }) {
  return <div className="rounded-lg border border-border bg-surface p-4"><p className="text-2xl font-semibold tabular-nums">{value ?? '—'}</p><p className="mt-1 text-xs text-foreground-muted">{label}</p></div>
}

export default function EsignAdminPage() {
  const [section, setSection] = React.useState<Section>('Overview')
  const context = useEsignContext()
  const overview = useEsignAdminOverview()

  if (context.isLoading) return <Skeleton className="h-[560px] w-full" />
  if (!context.data?.profile.admin_override) {
    return <div className="rounded-xl border border-border bg-surface p-8"><ShieldCheck className="size-8 text-foreground-subtle" /><h1 className="mt-4 text-xl font-semibold">Administration is restricted</h1><p className="mt-2 text-sm text-foreground-muted">A firm administrator can manage E‑Signature settings and oversight.</p></div>
  }

  return <div className="space-y-5">
    <div><p className="text-sm font-medium text-primary">Firm administration</p><h1 className="text-2xl font-semibold tracking-tight">E‑Signature Admin</h1><p className="mt-1 text-sm text-foreground-muted">Central controls, custody, branding, and delivery diagnostics for {context.data.firm.name}.</p></div>
    <div className="grid min-h-[570px] overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:grid-cols-[230px_minmax(0,1fr)]">
      <nav className="border-b border-border bg-surface-muted/40 p-3 lg:border-b-0 lg:border-r" aria-label="E-Signature administration">
        {sections.map((item) => <button key={item} onClick={() => setSection(item)} className={cn('mb-1 block w-full rounded-md px-3 py-2 text-left text-sm', section === item ? 'bg-primary-soft font-medium text-primary' : 'text-foreground-muted hover:bg-surface')}>{item}</button>)}
      </nav>
      <main className="p-5 md:p-6">
        {section === 'Overview' && <OverviewPanel data={overview.data} />}
        {section === 'Users & permissions' && <PermissionsPanel />}
        {section === 'Branding' && <BrandingPanel />}
        {section === 'Settings' && <SettingsPanel />}
        {section === 'Webhooks' && <WebhooksPanel />}
        {section === 'Audit' && <AuditPanel />}
      </main>
    </div>
  </div>
}

function OverviewPanel({ data }: { data?: { envelopes: number; users: number; send_failures: number; expiring_envelopes: number; webhook_failures: number; custody_issues: number } }) {
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold">Firm overview</h2><p className="text-sm text-foreground-muted">Current activity and items needing attention.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Envelopes" value={data?.envelopes} /><Metric label="Users" value={data?.users} /><Metric label="Send failures" value={data?.send_failures} /><Metric label="Expiring in 7 days" value={data?.expiring_envelopes} /><Metric label="Webhook failures" value={data?.webhook_failures} /><Metric label="Custody issues" value={data?.custody_issues} /></div></div>
}

function PermissionsPanel() {
  const profiles = useEsignPermissionProfiles()
  return <div className="space-y-5"><div className="flex items-center gap-3"><Users className="size-5 text-primary" /><div><h2 className="text-lg font-semibold">Users & permissions</h2><p className="text-sm text-foreground-muted">Reusable profiles combine with firm feature controls.</p></div></div><div className="grid gap-3 md:grid-cols-2">{profiles.data?.profiles.map((profile) => <div key={profile.id} className="rounded-lg border border-border p-4"><div className="flex items-center justify-between"><h3 className="font-medium">{profile.name}</h3>{profile.locked && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-foreground-muted">Built in · locked</span>}</div><p className="mt-2 text-xs leading-5 text-foreground-muted">{Object.entries(profile.capabilities).filter(([, enabled]) => enabled).map(([name]) => name.replace(/_/g, ' ')).join(' · ') || 'No sender capabilities'}</p></div>)}</div></div>
}

function BrandingPanel() {
  const brands = useEsignBrands()
  return <div className="space-y-5"><div className="flex items-center gap-3"><Palette className="size-5 text-primary" /><div><h2 className="text-lg font-semibold">Branding</h2><p className="text-sm text-foreground-muted">Reusable visual identities are snapshotted when an envelope is sent.</p></div></div>{brands.data?.brands.length ? <div className="grid gap-3 md:grid-cols-2">{brands.data.brands.map((brand) => <div key={String(brand.id)} className="rounded-lg border border-border p-4"><div className="mb-3 h-2 rounded-full" style={{ backgroundColor: String(brand.primary_color) }} /><h3 className="font-medium">{String(brand.name)}</h3><p className="mt-1 text-xs text-foreground-muted">{brand.active ? 'Active' : 'Inactive'} · Reply-to {String(brand.reply_to_address || 'firm default')}</p></div>)}</div> : <p className="rounded-lg border border-dashed border-border p-6 text-sm text-foreground-muted">CPAAutomation fallback branding is active. Add a firm brand through the API to customize signing and email surfaces.</p>}</div>
}

function SettingsPanel() {
  const settings = useEsignAdminSettings()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [days, setDays] = React.useState('30')
  React.useEffect(() => { if (settings.data?.expiration_days) setDays(String(settings.data.expiration_days)) }, [settings.data])
  return <div className="space-y-5"><div className="flex items-center gap-3"><Settings2 className="size-5 text-primary" /><div><h2 className="text-lg font-semibold">Sending defaults & features</h2><p className="text-sm text-foreground-muted">Locked values are revalidated at send time.</p></div></div><div className="max-w-md space-y-4 rounded-lg border border-border p-4"><label className="block text-sm font-medium">Default expiration (days)<Input className="mt-2" type="number" min={1} max={3650} value={days} onChange={(event) => setDays(event.target.value)} /></label><div className="grid grid-cols-2 gap-2 text-xs text-foreground-muted">{Object.entries(settings.data?.features ?? {}).map(([name, enabled]) => <div key={name} className="rounded bg-surface-muted px-2 py-1.5">{enabled ? 'On' : 'Off'} · {name.replace(/_/g, ' ')}</div>)}</div><Button onClick={async () => { try { await apiClient.updateEsignAdminSettings({ expiration_days: Number(days) }); await queryClient.invalidateQueries({ queryKey: ['esign', 'admin', 'settings'] }); toast({ title: 'Settings saved' }) } catch (error) { toast({ title: 'Could not save settings', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}>Save defaults</Button></div></div>
}

function WebhooksPanel() {
  const configs = useEsignFirmWebhooks(); const deliveries = useEsignWebhookDeliveries(); const queryClient = useQueryClient(); const { toast } = useToast()
  const [endpoint, setEndpoint] = React.useState('')
  return <div className="space-y-5"><div className="flex items-center gap-3"><Link2 className="size-5 text-primary" /><div><h2 className="text-lg font-semibold">Outbound webhooks</h2><p className="text-sm text-foreground-muted">HMAC-signed, at-least-once event delivery with replay diagnostics.</p></div></div><div className="flex max-w-2xl gap-2"><Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="https://hooks.example.com/esign" /><Button disabled={!endpoint} onClick={async () => { try { const result = await apiClient.createEsignFirmWebhook({ endpoint_url: endpoint, event_filters: ['*'] }); setEndpoint(''); await queryClient.invalidateQueries({ queryKey: ['esign', 'admin', 'webhooks'] }); toast({ title: 'Webhook created', description: `Copy the secret now: ${result.secret}` }) } catch (error) { toast({ title: 'Webhook rejected', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) } }}>Add endpoint</Button></div><div className="space-y-2">{configs.data?.configurations.map((config) => <div key={config.id} className="flex items-center justify-between rounded-lg border border-border p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{config.endpoint_url}</p><p className="text-xs text-foreground-muted">{config.enabled ? 'Enabled' : 'Disabled'} · {config.event_filters.join(', ') || 'all events'}</p></div><KeyRound className="size-4 text-foreground-subtle" /></div>)}</div><div><h3 className="mb-2 text-sm font-medium">Recent deliveries</h3><div className="space-y-1">{deliveries.data?.deliveries.slice(0, 8).map((item) => <div key={String(item.id)} className="grid grid-cols-[1fr_auto_auto] gap-3 rounded bg-surface-muted px-3 py-2 text-xs"><span className="truncate">{String(item.event_id)}</span><span>{String(item.status)}</span>{item.status !== 'succeeded' ? <button className="text-primary hover:underline" onClick={() => apiClient.replayEsignWebhook(String(item.id)).then(() => queryClient.invalidateQueries({ queryKey: ['esign', 'admin', 'deliveries'] }))}>Replay</button> : <span />}</div>)}</div></div></div>
}

function AuditPanel() {
  const audit = useQuery({ queryKey: ['esign', 'admin', 'audit'], queryFn: () => apiClient.request<{ events: Record<string, any>[] }>('/api/esign/admin/audit') })
  return <div className="space-y-5"><div className="flex items-center gap-3"><Activity className="size-5 text-primary" /><div><h2 className="text-lg font-semibold">Administration audit</h2><p className="text-sm text-foreground-muted">Immutable firm-scoped configuration and access history.</p></div></div><div className="divide-y divide-border rounded-lg border border-border">{audit.data?.events.map((event) => <div key={String(event.id)} className="grid gap-1 p-3 text-sm sm:grid-cols-[190px_minmax(0,1fr)_180px]"><span className="text-foreground-muted">{new Date(String(event.created_at)).toLocaleString()}</span><span>{String(event.event_type).replace(/_/g, ' ')}</span><span className="truncate text-foreground-muted">{String(event.actor_email || 'System')}</span></div>)}</div></div>
}

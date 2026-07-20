'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, FileSignature, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Config = { name: string; instructions?: string | null; roles: { recipient_index: number; label: string; role: string }[]; fields: string[] }

export default function PublicPowerFormPage() {
  const token = String(useParams<{ token: string }>().token)
  const [config, setConfig] = React.useState<Config | null>(null); const [error, setError] = React.useState<string | null>(null)
  const [recipients, setRecipients] = React.useState<Record<number, { name: string; email: string }>>({}); const [fields, setFields] = React.useState<Record<string, string>>({})
  const [consent, setConsent] = React.useState(false); const [busy, setBusy] = React.useState(false); const [done, setDone] = React.useState(false)
  React.useEffect(() => { fetch(`/api/esign/public/powerforms/${encodeURIComponent(token)}`).then(async response => {
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.detail ?? 'This form is unavailable'); setConfig(body)
  }).catch(cause => setError(cause instanceof Error ? cause.message : 'This form is unavailable')) }, [token])
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/esign/public/powerforms/${encodeURIComponent(token)}/verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: Object.entries(recipients).map(([recipient_index, value]) => ({ recipient_index: Number(recipient_index), ...value })), fields, consent }) })
      if (!response.ok) throw new Error('Verification could not be requested'); setDone(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Verification could not be requested') } finally { setBusy(false) }
  }
  if (error && !config) return <main className="mx-auto max-w-lg px-6 py-24 text-center"><FileSignature className="mx-auto size-10 text-foreground-muted" /><h1 className="mt-4 text-xl font-semibold">Form unavailable</h1><p className="mt-2 text-sm text-foreground-muted">{error}</p></main>
  if (!config) return <main className="grid min-h-[60vh] place-items-center"><Loader2 className="size-6 animate-spin text-primary" /></main>
  if (done) return <main className="mx-auto max-w-lg px-6 py-24 text-center"><CheckCircle2 className="mx-auto size-12 text-success" /><h1 className="mt-4 text-xl font-semibold">Check your email</h1><p className="mt-2 text-sm text-foreground-muted">If this submission can be accepted, a single-use verification link will arrive shortly. It expires in 15 minutes.</p></main>
  const complete = consent && config.roles.every(role => recipients[role.recipient_index]?.name && recipients[role.recipient_index]?.email)
  return <main className="mx-auto max-w-2xl px-6 py-12"><div className="mb-6 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground"><FileSignature className="size-5" /></span><div><p className="text-xs font-semibold uppercase tracking-wider text-foreground-subtle">CPAAutomation E‑Signature</p><h1 className="text-2xl font-semibold">{config.name}</h1></div></div>
    <section className="space-y-5 rounded-xl border border-border bg-surface p-6 shadow-sm">{config.instructions && <p className="rounded-lg bg-surface-muted p-4 text-sm text-foreground-muted">{config.instructions}</p>}
      {config.roles.map(role => <div className="grid gap-3 sm:grid-cols-2" key={role.recipient_index}><h2 className="sm:col-span-2 font-medium">{role.label} <span className="text-xs font-normal capitalize text-foreground-muted">· {role.role.replace(/_/g, ' ')}</span></h2><div><Label>Name</Label><Input autoComplete="name" value={recipients[role.recipient_index]?.name ?? ''} onChange={e => setRecipients(current => ({ ...current, [role.recipient_index]: { ...current[role.recipient_index], name: e.target.value, email: current[role.recipient_index]?.email ?? '' } }))} /></div><div><Label>Email</Label><Input type="email" autoComplete="email" value={recipients[role.recipient_index]?.email ?? ''} onChange={e => setRecipients(current => ({ ...current, [role.recipient_index]: { ...current[role.recipient_index], email: e.target.value, name: current[role.recipient_index]?.name ?? '' } }))} /></div></div>)}
      {config.fields.map(field => <div key={field}><Label>{field.replace(/_/g, ' ')}</Label><Input value={fields[field] ?? ''} onChange={e => setFields(current => ({ ...current, [field]: e.target.value }))} /></div>)}
      <label className="flex items-start gap-3 rounded-lg border border-border p-4 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span><span className="font-medium">I consent to electronic records and signatures.</span><span className="mt-1 block text-foreground-muted">Your email, consent, IP address, browser, and signing actions are recorded in the envelope audit trail.</span></span></label>
      {error && <p className="text-sm text-destructive">{error}</p>}<Button className="w-full" disabled={!complete || busy} onClick={() => void submit()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />} Verify email to continue</Button>
    </section></main>
}

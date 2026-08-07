'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { pbcApi } from '@/lib/pbc/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function PbcSettingsPage() {
  const query = useQuery({ queryKey: ['pbc', 'settings'], queryFn: pbcApi.settings })
  const [form, setForm] = React.useState({ timezone: 'America/Los_Angeles', portal_name: '', logo_url: '', reminder_days_before: 3, overdue_interval_days: 3 })
  const [status, setStatus] = React.useState<string | null>(null)
  React.useEffect(() => { if (query.data) setForm({ ...query.data, portal_name: query.data.portal_name || '', logo_url: query.data.logo_url || '' }) }, [query.data])
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setStatus('Saving…')
    try { await pbcApi.updateSettings({ ...form, portal_name: form.portal_name || null, logo_url: form.logo_url || null }); setStatus('Saved') }
    catch (err) { setStatus(err instanceof Error ? err.message : 'Save failed') }
  }
  return <div className="mx-auto max-w-2xl space-y-6"><div><Link href="/dashboard/pbc" className="inline-flex items-center gap-1 text-sm text-foreground-muted"><ArrowLeft className="size-4" />PBC workspace</Link><h1 className="mt-3 text-2xl font-semibold">PBC settings</h1><p className="mt-1 text-sm text-foreground-muted">Defaults for your firm’s client portal and reminders.</p></div><form onSubmit={save} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm"><div className="space-y-2"><Label>Portal name</Label><Input value={form.portal_name} onChange={(e) => setForm({ ...form, portal_name: e.target.value })} placeholder="Your firm client portal" /></div><div className="space-y-2"><Label>Logo URL</Label><Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" /></div><div className="space-y-2"><Label>Firm timezone</Label><Input required value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Remind before due date</Label><Input type="number" min={0} max={30} value={form.reminder_days_before} onChange={(e) => setForm({ ...form, reminder_days_before: Number(e.target.value) })} /><p className="text-xs text-foreground-muted">Days before the due date.</p></div><div className="space-y-2"><Label>Overdue reminder interval</Label><Input type="number" min={1} max={30} value={form.overdue_interval_days} onChange={(e) => setForm({ ...form, overdue_interval_days: Number(e.target.value) })} /><p className="text-xs text-foreground-muted">Days between overdue reminders.</p></div></div><div className="flex items-center justify-end gap-3">{status && <span className="text-sm text-foreground-muted">{status}</span>}<Button>Save settings</Button></div></form></div>
}


'use client'
import { useState } from 'react'
import { useCrmContext, useAuth } from '../lib/auth'
import { patch } from '../api/client'
import { Button, Card, Field, Input, PageHeader } from '../components/ui'
import { useToast } from '../components/ui/Toast'

export default function SettingsPage() {
  const { settings } = useCrmContext()
  const { hasRole } = useAuth()
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const { toast, error } = useToast()
  const editable = hasRole('admin')
  return <div><PageHeader title="CRM settings" subtitle="Firm-wide business rules and record visibility"/><Card title="Business rules"><form className="max-w-lg space-y-4" onSubmit={async e=>{e.preventDefault();setSaving(true);try { await patch('/settings',draft);toast('Settings saved') } catch(e) { error(e) } finally { setSaving(false) }}}>
    <Field label="Currency"><Input value={draft.default_currency} pattern="[A-Z]{3}" required maxLength={3} disabled={!editable} onChange={e=>setDraft({...draft,default_currency:e.target.value.toUpperCase()})}/></Field>
    <Field label="Days without activity before a pursuit is stale"><Input type="number" min={1} max={365} required disabled={!editable} value={draft.stale_opportunity_days} onChange={e=>setDraft({...draft,stale_opportunity_days:Number(e.target.value)})}/></Field>
    <Field label="Conflict match threshold"><Input type="number" min={0.5} max={1} step={0.01} required disabled={!editable} value={draft.conflict_match_threshold} onChange={e=>setDraft({...draft,conflict_match_threshold:Number(e.target.value)})}/></Field>
    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.admin_bypasses_walls} disabled={!editable} onChange={e=>setDraft({...draft,admin_bypasses_walls:e.target.checked})}/>Allow CRM administrators to see all ethical walls in this firm</label>
    {editable && <Button type="submit" variant="primary" disabled={saving}>{saving?'Saving…':'Save settings'}</Button>}
    <p className="text-xs text-crm-sand-600">Sign-in, passwords, and firm invitations are managed by CPAAutomation.</p>
  </form></Card></div>
}

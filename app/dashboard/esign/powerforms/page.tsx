'use client'

import * as React from 'react'
import { Copy, Link2, RotateCw } from 'lucide-react'
import { useEsignTemplate, useEsignTemplates } from '@/hooks/useEnvelopes'
import { useCreatePowerForm, usePowerFormAction, usePowerForms, useTemplateVersions } from '@/hooks/useEsignScale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

type RoleConfig = { recipient_index: number; identity_source: 'visitor' | 'preset'; initiating_signer: boolean; name?: string; email?: string }

export default function PowerFormsPage() {
  const { toast } = useToast(); const templates = useEsignTemplates(); const forms = usePowerForms(); const create = useCreatePowerForm(); const action = usePowerFormAction()
  const [templateId, setTemplateId] = React.useState(''); const template = useEsignTemplate(templateId); const versions = useTemplateVersions(templateId)
  const [versionId, setVersionId] = React.useState(''); const [name, setName] = React.useState(''); const [cap, setCap] = React.useState('')
  const [roles, setRoles] = React.useState<RoleConfig[]>([]); const [latestUrl, setLatestUrl] = React.useState<string | null>(null)
  React.useEffect(() => setVersionId(versions.data?.versions[0]?.id ?? ''), [versions.data])
  React.useEffect(() => setRoles((template.data?.recipient_roles ?? []).map((_, index) => ({ recipient_index: index, identity_source: 'visitor', initiating_signer: index === 0 }))), [template.data])
  const updateRole = (index: number, patch: Partial<RoleConfig>) => setRoles(current => current.map((role, i) => i === index ? { ...role, ...patch } : role))
  const submit = async () => {
    try {
      const result = await create.mutateAsync({ name, template_version_id: versionId, submission_cap: cap ? Number(cap) : null, role_config: roles, public_fields: [] })
      setLatestUrl(result.public_url ?? null); toast({ title: 'PowerForm created', description: 'Copy the link now; only its hash is stored.' })
    } catch (error) { toast({ title: 'Could not create PowerForm', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }) }
  }

  return <div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Self-service signing</p><h1 className="text-2xl font-semibold">PowerForms</h1><p className="mt-1 text-sm text-foreground-muted">Reusable, email-verified links pinned to a published template version.</p></div>
    <section className="space-y-5 rounded-xl border border-border bg-surface p-5 shadow-sm"><h2 className="font-semibold">Create a link</h2>
      <div className="grid gap-4 sm:grid-cols-2"><div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="New client engagement" /></div><div><Label>Submission cap (optional)</Label><Input type="number" min={1} value={cap} onChange={e => setCap(e.target.value)} /></div>
        <div><Label>Template</Label><Select value={templateId} onValueChange={setTemplateId}><SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger><SelectContent>{templates.data?.templates.map(t => <SelectItem value={t.id} key={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Published version</Label><Select value={versionId} onValueChange={setVersionId}><SelectTrigger><SelectValue placeholder="Publish template first" /></SelectTrigger><SelectContent>{versions.data?.versions.map(v => <SelectItem value={v.id} key={v.id}>Version {v.version}</SelectItem>)}</SelectContent></Select></div></div>
      {!!roles.length && <div className="space-y-2"><Label>Recipient identities</Label>{roles.map((role, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_150px_180px_1fr_1fr] sm:items-end"><p className="pb-2 text-sm font-medium">{String(template.data?.recipient_roles[index]?.label ?? `Role ${index + 1}`)}</p>
        <Select value={role.identity_source} onValueChange={value => updateRole(index, { identity_source: value as 'visitor' | 'preset', initiating_signer: value === 'preset' ? false : role.initiating_signer })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="visitor">Visitor provided</SelectItem><SelectItem value="preset">Preset by firm</SelectItem></SelectContent></Select>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="radio" name="initiator" checked={role.initiating_signer} disabled={role.identity_source !== 'visitor'} onChange={() => setRoles(current => current.map((item, i) => ({ ...item, initiating_signer: i === index })))} /> Initiating signer</label>
        {role.identity_source === 'preset' && <><Input placeholder="Preset name" value={role.name ?? ''} onChange={e => updateRole(index, { name: e.target.value })} /><Input type="email" placeholder="Preset email" value={role.email ?? ''} onChange={e => updateRole(index, { email: e.target.value })} /></>}</div>)}</div>}
      <div className="flex flex-wrap items-center gap-3"><Button disabled={!name || !versionId || !roles.length || create.isPending} onClick={() => void submit()}><Link2 className="mr-2 size-4" /> Create PowerForm</Button>{latestUrl && <><Input readOnly value={latestUrl} className="max-w-xl" /><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(latestUrl); toast({ title: 'Link copied' }) }}><Copy className="mr-2 size-4" /> Copy</Button></>}</div>
    </section>
    <section className="rounded-xl border border-border bg-surface shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Published links</h2></div>{forms.data?.powerforms.length ? <ul className="divide-y">{forms.data.powerforms.map(form => <li key={form.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><Link2 className="size-5 text-foreground-muted" /><div><p className="text-sm font-medium">{form.name}</p><p className="text-xs text-foreground-muted">{form.submission_count}{form.submission_cap ? ` / ${form.submission_cap}` : ''} submissions</p></div><Badge variant="outline">{form.state}</Badge></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={async () => { const result = await action.mutateAsync({ id: form.id, action: 'rotate' }); setLatestUrl(result.public_url ?? null) }}><RotateCw className="mr-1 size-3" /> Rotate</Button><Button size="sm" variant="outline" onClick={() => void action.mutateAsync({ id: form.id, action: form.state === 'active' ? 'paused' : 'active' })}>{form.state === 'active' ? 'Pause' : 'Resume'}</Button></div></li>)}</ul> : <p className="p-8 text-center text-sm text-foreground-muted">No PowerForms yet.</p>}</section>
  </div>
}

'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FileCheck2, Library, LockKeyhole, Plus, Search, Settings, UserPlus } from 'lucide-react'

import { useAnalyticsClients } from '@/hooks/useAnalyticsClients'
import { useCreatePbcEngagement, usePbcClientEngagements, usePbcDashboard, usePbcEngagements } from '@/hooks/usePbc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { pbcApi } from '@/lib/pbc/api'
import { parsePbcEngagementSource, pbcEngagementSourcePayload, pbcRolloverCandidates } from '@/lib/pbc/engagementForm'

const statusTone: Record<string, string> = {
  draft: 'bg-surface-muted text-foreground-muted',
  active: 'bg-primary-soft text-primary',
  completed: 'bg-success-soft text-success',
  archived: 'bg-surface-muted text-foreground-subtle',
}

export default function PbcDashboardPage() {
  const router = useRouter()
  const dashboard = usePbcDashboard()
  const clientEngagements = usePbcClientEngagements()
  const engagements = usePbcEngagements()
  const clients = useAnalyticsClients()
  const create = useCreatePbcEngagement()
  const templates = useQuery({ queryKey: ['pbc', 'templates'], queryFn: pbcApi.templates })
  const projectLinks = useQuery({ queryKey: ['pbc', 'project-links'], queryFn: pbcApi.projectLinks })
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [openingClientId, setOpeningClientId] = React.useState<string | null>(null)
  const [clientAccessError, setClientAccessError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({ name: '', client_id: '', period_start: '', period_end: '', due_date: '', source: 'blank', project_link: '' })

  const rows = (engagements.data?.engagements || []).filter((item) =>
    `${item.name} ${item.client_name}`.toLowerCase().includes(query.toLowerCase()),
  )
  const rolloverCandidates = pbcRolloverCandidates(engagements.data?.engagements || [], form.client_id)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const linkedProject = projectLinks.data?.projects.find((item) => `${item.workspace_id}:${item.project_id}` === form.project_link)
    const source = parsePbcEngagementSource(form.source)
    const rolloverSource = source.kind === 'rollover'
      ? rolloverCandidates.find((item) => item.id === source.id)
      : undefined
    const result = await create.mutateAsync({
      name: form.name,
      client_id: form.client_id,
      engagement_type: source.kind === 'template'
        ? templates.data?.templates.find((template) => String(template.id) === source.id)?.engagement_type || 'audit'
        : rolloverSource?.engagement_type || 'audit',
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      due_date: form.due_date || null,
      ...pbcEngagementSourcePayload(source),
      tasklytic_workspace_id: linkedProject?.workspace_id || null,
      tasklytic_project_id: linkedProject?.project_id || null,
    })
    setOpen(false)
    router.push(`/dashboard/pbc/engagements/${result.id}`)
  }

  const openClientEngagement = async (engagementId: string) => {
    setOpeningClientId(engagementId)
    setClientAccessError(null)
    try {
      const session = await pbcApi.openClientEngagement(engagementId)
      sessionStorage.setItem('pbc_portal_csrf', session.csrf_token)
      window.location.assign('/pbc/access')
    } catch (error) {
      setClientAccessError(error instanceof Error ? error.message : 'The client portal could not be opened.')
      setOpeningClientId(null)
    }
  }

  const stats = [
    { label: 'Active engagements', value: dashboard.data?.active_engagements || 0, icon: FileCheck2, tone: 'text-primary bg-primary-soft' },
    { label: 'Awaiting review', value: dashboard.data?.awaiting_review || 0, icon: Clock3, tone: 'text-warning bg-warning-soft' },
    { label: 'Overdue requests', value: dashboard.data?.overdue || 0, icon: AlertTriangle, tone: 'text-destructive bg-destructive/10' },
    { label: 'Accepted evidence', value: dashboard.data?.accepted_requests || 0, icon: CheckCircle2, tone: 'text-success bg-success-soft' },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Prepared by Client</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">PBC workspace</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground-muted">Collect audit evidence, keep client conversations attached to requests, and see what needs attention.</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/dashboard/pbc/templates"><Library className="mr-2 size-4" />Templates</Link></Button><Button variant="outline" asChild><Link href="/dashboard/pbc/settings"><Settings className="mr-2 size-4" />Settings</Link></Button><Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 size-4" />New engagement</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create PBC engagement</DialogTitle>
              <DialogDescription>Start a focused request list for one client and audit period.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-2"><Label htmlFor="pbc-name">Engagement name</Label><Input id="pbc-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="2026 Financial Statement Audit" /></div>
              <div className="space-y-2">
                <div className="flex items-center justify-between"><Label>Client</Label><Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" asChild><Link href="/dashboard/analytics/clients?addClient=true"><UserPlus className="mr-1 size-3" />Add a new client</Link></Button></div>
                <Select required value={form.client_id} onValueChange={(value) => setForm({ ...form, client_id: value, source: form.source.startsWith('rollover:') ? 'blank' : form.source })}><SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger><SelectContent>{(clients.data?.clients || []).map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2">
                <Label>Start request list from</Label>
                <Select value={form.source} onValueChange={(value) => setForm({ ...form, source: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blank">Blank engagement</SelectItem>
                    {(templates.data?.templates || []).map((template) => <SelectItem key={String(template.id)} value={`template:${String(template.id)}`}>Template · {String(template.name)}</SelectItem>)}
                    {rolloverCandidates.map((engagement) => <SelectItem key={engagement.id} value={`rollover:${engagement.id}`}>Rollover · {engagement.name}{engagement.period_end ? ` (${engagement.period_end})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.client_id && rolloverCandidates.length === 0 && <p className="text-xs text-foreground-muted">No prior engagements are available for this client yet.</p>}
                {form.source.startsWith('rollover:') && <p className="text-xs text-foreground-muted">Request details and internal owners will be copied without prior evidence, comments, assignments, or statuses.</p>}
              </div>
              {(projectLinks.data?.projects.length || 0) > 0 && <div className="space-y-2"><Label>Linked project management project</Label><Select value={form.project_link || 'none'} onValueChange={(value) => setForm({ ...form, project_link: value === 'none' ? '' : value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No linked project</SelectItem>{projectLinks.data?.projects.map((project) => <SelectItem key={`${project.workspace_id}:${project.project_id}`} value={`${project.workspace_id}:${project.project_id}`}>{project.name}</SelectItem>)}</SelectContent></Select></div>}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2"><Label htmlFor="period-start">Period start</Label><Input id="period-start" type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="period-end">Period end</Label><Input id="period-end" type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="due-date">Default due date</Label><Input id="due-date" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
              {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
              <Button className="w-full" disabled={create.isPending || !form.client_id}>{create.isPending ? 'Creating…' : 'Create engagement'}</Button>
            </form>
          </DialogContent>
        </Dialog></div>
      </div>

      {(clientEngagements.data?.engagements.length || 0) > 0 && (
        <section className="rounded-xl border border-primary/20 bg-primary-soft/40 shadow-sm">
          <div className="flex items-start gap-3 border-b border-primary/20 p-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><LockKeyhole className="size-4" /></span>
            <div><h2 className="font-semibold">Engagements shared with you</h2><p className="text-sm text-foreground-muted">Open these client workspaces with your signed-in email. You do not need another email link.</p></div>
          </div>
          {clientAccessError && <p className="border-b border-primary/20 px-5 py-3 text-sm text-destructive">{clientAccessError}</p>}
          <div className="divide-y divide-border">
            {clientEngagements.data?.engagements.map((item) => (
              <div key={item.id} className="grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_130px_160px] sm:items-center">
                <div><div className="flex items-center gap-2"><p className="font-medium">{item.name}</p><Badge variant="secondary" className={statusTone[item.status]}>{item.status}</Badge></div><p className="mt-1 text-sm text-foreground-muted">{item.portal_brand.portal_name}{item.period_end ? ` · Period ended ${item.period_end}` : ''}</p></div>
                <div className="text-sm"><p className="font-medium tabular-nums">{item.progress}%</p><p className="text-foreground-muted">complete</p></div>
                <Button onClick={() => void openClientEngagement(item.id)} disabled={openingClientId === item.id}>{openingClientId === item.id ? 'Opening…' : 'View engagement'}<ArrowRight className="ml-2 size-4" /></Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="PBC summary">
        {stats.map(({ label, value, icon: Icon, tone }) => <div key={label} className="rounded-xl border bg-card p-5 shadow-sm"><div className={`mb-4 inline-flex size-9 items-center justify-center rounded-lg ${tone}`}><Icon className="size-4" /></div><p className="text-3xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-sm text-foreground-muted">{label}</p></div>)}
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">Engagements</h2><p className="text-sm text-foreground-muted">All request lists across your firm.</p></div>
          <div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients or engagements" /></div>
        </div>
        <div className="divide-y">
          {engagements.isLoading && <p className="p-8 text-center text-sm text-foreground-muted">Loading PBC engagements…</p>}
          {!engagements.isLoading && rows.length === 0 && <div className="p-12 text-center"><FileCheck2 className="mx-auto size-8 text-foreground-muted" /><h3 className="mt-3 font-medium">No PBC engagements yet</h3><p className="mt-1 text-sm text-foreground-muted">Create one to replace the request-list spreadsheet and email chase.</p></div>}
          {rows.map((item) => (
            <Link key={item.id} href={`/dashboard/pbc/engagements/${item.id}`} className="grid gap-4 p-5 transition-colors hover:bg-surface-muted/50 sm:grid-cols-[minmax(0,1fr)_130px_160px_24px] sm:items-center">
              <div><div className="flex items-center gap-2"><p className="font-medium">{item.name}</p><Badge variant="secondary" className={statusTone[item.status]}>{item.status}</Badge></div><p className="mt-1 text-sm text-foreground-muted">{item.client_name}{item.period_end ? ` · Period ended ${item.period_end}` : ''}</p></div>
              <div className="text-sm"><p className="font-medium tabular-nums">{item.progress}%</p><p className="text-foreground-muted">complete</p></div>
              <div><Progress value={item.progress} className="h-2" /><p className="mt-1.5 text-xs text-foreground-muted">{item.request_count} requests</p></div>
              <ArrowRight className="size-4 text-foreground-muted" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePageMeta } from '../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import {
  useActivityCodesStore, useBillingBudgetsStore, useRateCardsStore,
  useUsersStore, useWorkspacesStore,
} from '../../stores/entities'
import { canPerformWorkspaceAction } from '../../lib/permissions'
import { newId } from '../../lib/ids'
import { now } from '../../lib/time'
import { UTBMS_ACTIVITY_CODES } from '../../lib/psa/constants'
import { BillingRatesPanel } from '../psa/billing/BillingRatesPanel'
import { formatMoney } from '../../lib/billing/formatMoney'

export function BillingSettingsPage() {
  const { workspaceId, workspace } = useWorkspaceContext()
  const user = useCurrentUser()
  const canRate = canPerformWorkspaceAction(user, workspace, 'rate')
  const canAdmin = canPerformWorkspaceAction(user, workspace, 'workspace-administration')
  usePageMeta({ breadcrumbs: [{ label: 'Settings' }, { label: 'Billing' }] })
  if (!workspaceId || !workspace) return null
  return <div className="space-y-4" data-tour-page="billing-settings">
    <div><h1 className="font-sans text-2xl">Billing settings</h1><p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>Rates, invoice controls, approval routing, budgets, and FX overrides.</p></div>
    <Tabs defaultValue="rates">
      <TabsList className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="rates">Rates</TabsTrigger><TabsTrigger value="cards">Rate cards</TabsTrigger>
        <TabsTrigger value="codes">Activity codes</TabsTrigger><TabsTrigger value="invoicing">Invoicing</TabsTrigger>
        <TabsTrigger value="approvals">Approvals</TabsTrigger><TabsTrigger value="budgets">Budgets</TabsTrigger><TabsTrigger value="fx">FX rates</TabsTrigger>
      </TabsList>
      <TabsContent value="rates">{canRate ? <BillingRatesPanel workspaceId={workspaceId} /> : <ReadOnlyNotice />}</TabsContent>
      <TabsContent value="cards"><RateCards workspaceId={workspaceId} editable={canRate} /></TabsContent>
      <TabsContent value="codes"><ActivityCodes workspaceId={workspaceId} editable={canRate} /></TabsContent>
      <TabsContent value="invoicing"><InvoicingSettings editable={canAdmin} /></TabsContent>
      <TabsContent value="approvals"><InvoiceApprovals editable={canAdmin} /></TabsContent>
      <TabsContent value="budgets"><Budgets workspaceId={workspaceId} editable={canRate} /></TabsContent>
      <TabsContent value="fx"><FxOverrides editable={canAdmin} /></TabsContent>
    </Tabs>
  </div>
}

function ReadOnlyNotice() { return <p className="rounded-lg border border-border bg-card text-card-foreground p-4 text-sm">You can view billing configuration, but changing it requires rate-management permission.</p> }

function RateCards({ workspaceId, editable }: { workspaceId: string; editable: boolean }) {
  const cards = useRateCardsStore((state) => state.list().filter((card) => card.workspaceId === workspaceId))
  const add = useRateCardsStore((state) => state.add)
  const [name, setName] = useState('')
  const [role, setRole] = useState('Partner')
  const [rate, setRate] = useState('')
  const [currency, setCurrency] = useState('USD')
  const create = async () => {
    const hourlyRate = Number(rate)
    if (!name.trim() || hourlyRate <= 0) return
    await add({ id: newId(), workspaceId, name: name.trim(), currency: currency.toUpperCase(), effectiveFrom: new Date().toISOString().slice(0, 10), rates: [{ id: newId(), workspaceId, scope: 'role', role: role.trim(), hourlyRate, currency: currency.toUpperCase(), effectiveFrom: new Date().toISOString().slice(0, 10), createdAt: now() }] })
    setName(''); setRate('')
  }
  return <section className="space-y-3">
    {editable && <div className="rounded-lg border border-border bg-card text-card-foreground grid gap-3 p-4 md:grid-cols-5"><Input aria-label="Rate card name" placeholder="Card name" value={name} onChange={(event) => setName(event.target.value)} /><Input aria-label="Rate card role" placeholder="Role" value={role} onChange={(event) => setRole(event.target.value)} /><Input aria-label="Rate card amount" placeholder="Hourly rate" value={rate} onChange={(event) => setRate(event.target.value)} /><Input aria-label="Rate card currency" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value)} /><Button onClick={() => void create()}>Create rate card</Button></div>}
    <div className="grid gap-3 md:grid-cols-2">{cards.map((card) => <article key={card.id} className="rounded-lg border border-border bg-card text-card-foreground p-4"><h3 className="font-medium">{card.name}</h3><p className="text-xs">{card.currency} · effective {card.effectiveFrom}</p>{card.rates.map((item) => <p className="mt-2 flex justify-between text-sm" key={item.id}><span>{item.userId ?? item.role ?? item.scope}</span><span className="font-mono">{formatMoney(item.hourlyRate, item.currency)}/hr</span></p>)}</article>)}</div>
  </section>
}

function ActivityCodes({ workspaceId, editable }: { workspaceId: string; editable: boolean }) {
  const codes = useActivityCodesStore((state) => state.list().filter((code) => code.workspaceId === workspaceId))
  const add = useActivityCodesStore((state) => state.add)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const create = async (nextCode = code, nextName = name) => {
    if (!nextCode.trim() || !nextName.trim() || codes.some((item) => item.code === nextCode.trim().toUpperCase())) return
    await add({ id: newId(), workspaceId, code: nextCode.trim().toUpperCase(), name: nextName.trim(), active: true, createdAt: now() })
  }
  const loadUtbms = async () => { for (const item of UTBMS_ACTIVITY_CODES) await create(item.code, item.label) }
  return <section className="space-y-3">{editable && <div className="rounded-lg border border-border bg-card text-card-foreground flex flex-wrap gap-3 p-4"><Input aria-label="Activity code" className="max-w-40" placeholder="Code" value={code} onChange={(event) => setCode(event.target.value)} /><Input aria-label="Activity name" className="max-w-xs" placeholder="Description" value={name} onChange={(event) => setName(event.target.value)} /><Button onClick={() => void create()}>Add code</Button><Button variant="outline" onClick={() => void loadUtbms()}>Load UTBMS defaults</Button></div>}<div className="rounded-lg border border-border bg-card text-card-foreground divide-y">{codes.map((item) => <div className="flex justify-between p-3 text-sm" key={item.id}><span><b className="font-mono">{item.code}</b> · {item.name}</span><span>{item.active ? 'Active' : 'Inactive'}</span></div>)}</div></section>
}

function InvoicingSettings({ editable }: { editable: boolean }) {
  const { workspace } = useWorkspaceContext()
  const update = useWorkspacesStore((state) => state.update)
  const [prefix, setPrefix] = useState(workspace?.invoicePrefix ?? 'INV-')
  const [start, setStart] = useState(String(workspace?.invoiceStartNumber ?? 1000))
  const [footer, setFooter] = useState(workspace?.billingSettings?.defaultFooter ?? '')
  const [header, setHeader] = useState(workspace?.billingSettings?.brandedHeader ?? workspace?.name ?? '')
  const [terms, setTerms] = useState(workspace?.billingSettings?.defaultPaymentTerms ?? 'net_30')
  const [trustThreshold, setTrustThreshold] = useState(String(workspace?.billingSettings?.trustLowBalanceThreshold ?? 5000))
  const [budgetWarning, setBudgetWarning] = useState(String(workspace?.billingSettings?.budgetWarningPercent ?? 80))
  if (!workspace) return null
  const save = () => update(workspace.id, { invoicePrefix: prefix, invoiceStartNumber: Number(start), billingSettings: { ...workspace.billingSettings, defaultFooter: footer, brandedHeader: header, defaultPaymentTerms: terms, trustLowBalanceThreshold: Number(trustThreshold), budgetWarningPercent: Number(budgetWarning) } })
  return <div className="rounded-lg border border-border bg-card text-card-foreground grid max-w-2xl gap-3 p-4"><Field label="Invoice prefix"><Input disabled={!editable} value={prefix} onChange={(event) => setPrefix(event.target.value)} /></Field><Field label="Starting number"><Input disabled={!editable} type="number" value={start} onChange={(event) => setStart(event.target.value)} /></Field><Field label="Default payment terms"><select disabled={!editable} className="rounded-md border border-input bg-background text-foreground h-10 rounded-md border px-3" value={terms} onChange={(event) => setTerms(event.target.value as typeof terms)}>{['due_on_receipt', 'net_15', 'net_30', 'net_45', 'net_60'].map((term) => <option key={term} value={term}>{term.replace(/_/g, ' ')}</option>)}</select></Field><Field label="Trust low-balance warning"><Input disabled={!editable} type="number" value={trustThreshold} onChange={(event) => setTrustThreshold(event.target.value)} /></Field><Field label="Budget warning percent"><Input disabled={!editable} type="number" min="1" max="100" value={budgetWarning} onChange={(event) => setBudgetWarning(event.target.value)} /></Field><Field label="Branded header"><Input disabled={!editable} value={header} onChange={(event) => setHeader(event.target.value)} /></Field><Field label="Default footer"><Input disabled={!editable} value={footer} onChange={(event) => setFooter(event.target.value)} /></Field>{editable && <Button className="w-fit" onClick={() => void save()}>Save invoicing settings</Button>}</div>
}

function InvoiceApprovals({ editable }: { editable: boolean }) {
  const { workspace } = useWorkspaceContext()
  const users = useUsersStore((state) => state.list().filter((user) => workspace?.memberIds.includes(user.id)))
  const update = useWorkspacesStore((state) => state.update)
  const [required, setRequired] = useState(workspace?.billingSettings?.invoiceApprovalRequired ?? false)
  const [approvers, setApprovers] = useState<Set<string>>(new Set(workspace?.billingSettings?.invoiceApproverIds ?? []))
  if (!workspace) return null
  const save = () => update(workspace.id, { billingSettings: { ...workspace.billingSettings, invoiceApprovalRequired: required, invoiceApproverIds: [...approvers] }, approvalSettings: { ...workspace.approvalSettings, invoiceApproverIds: [...approvers] } })
  return <div className="rounded-lg border border-border bg-card text-card-foreground max-w-2xl space-y-3 p-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={required} onChange={(event) => setRequired(event.target.checked)} />Require invoice approval before delivery</label><p className="text-sm font-medium">Invoice approval route</p>{users.map((member) => <label className="flex items-center gap-2 text-sm" key={member.id}><input type="checkbox" disabled={!editable} checked={approvers.has(member.id)} onChange={() => setApprovers((old) => { const next = new Set(old); if (next.has(member.id)) next.delete(member.id); else next.add(member.id); return next })} />{member.name}</label>)}{editable && <Button onClick={() => void save()}>Save invoice approvals</Button>}</div>
}

function Budgets({ workspaceId, editable }: { workspaceId: string; editable: boolean }) {
  const budgets = useBillingBudgetsStore((state) => state.list().filter((budget) => budget.workspaceId === workspaceId))
  const add = useBillingBudgetsStore((state) => state.add)
  const [scopeId, setScopeId] = useState('')
  const [amount, setAmount] = useState('')
  const [hours, setHours] = useState('')
  const create = async () => { if (!scopeId || (!Number(amount) && !Number(hours))) return; await add({ id: newId(), workspaceId, scope: 'matter', scopeId, amount: Number(amount) || undefined, hours: Number(hours) || undefined, currency: 'USD', warningPercent: 80, effectiveFrom: new Date().toISOString().slice(0, 10), createdAt: now() }); setScopeId('') }
  return <section className="space-y-3">{editable && <div className="rounded-lg border border-border bg-card text-card-foreground grid gap-3 p-4 md:grid-cols-4"><Input aria-label="Budget scope ID" placeholder="Matter / project ID" value={scopeId} onChange={(event) => setScopeId(event.target.value)} /><Input aria-label="Budget amount" placeholder="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} /><Input aria-label="Budget hours" placeholder="Hours" value={hours} onChange={(event) => setHours(event.target.value)} /><Button onClick={() => void create()}>Add budget</Button></div>}<div className="rounded-lg border border-border bg-card text-card-foreground divide-y">{budgets.map((budget) => <div className="flex justify-between p-3 text-sm" key={budget.id}><span>{budget.scope}: {budget.scopeId}</span><span className="font-mono">{budget.amount ? formatMoney(budget.amount, budget.currency) : '—'} · {budget.hours ?? '—'}h</span></div>)}</div></section>
}

function FxOverrides({ editable }: { editable: boolean }) {
  const { workspace } = useWorkspaceContext()
  const update = useWorkspacesStore((state) => state.update)
  const [pair, setPair] = useState('USD/')
  const [rate, setRate] = useState('')
  const [note, setNote] = useState('')
  if (!workspace) return null
  const add = () => { const normalized = pair.toUpperCase(); if (!/^[A-Z]{3}\/[A-Z]{3}$/.test(normalized) || Number(rate) <= 0) return; return update(workspace.id, { fxOverrides: { ...workspace.fxOverrides, [normalized]: { rate: Number(rate), effectiveOn: new Date().toISOString().slice(0, 10), note: note || undefined } } }) }
  return <section className="space-y-3"><p className="text-sm">ECB daily rates are cached automatically. Add a workspace quote only for unsupported currency pairs.</p>{editable && <div className="rounded-lg border border-border bg-card text-card-foreground flex flex-wrap gap-3 p-4"><Input aria-label="FX pair" className="max-w-36" value={pair} onChange={(event) => setPair(event.target.value)} /><Input aria-label="FX rate" className="max-w-36" placeholder="Rate" value={rate} onChange={(event) => setRate(event.target.value)} /><Input aria-label="FX note" className="max-w-xs" placeholder="Source / note" value={note} onChange={(event) => setNote(event.target.value)} /><Button onClick={() => void add()}>Add FX override</Button></div>}<div className="rounded-lg border border-border bg-card text-card-foreground divide-y">{Object.entries(workspace.fxOverrides ?? {}).map(([key, value]) => <div className="flex justify-between p-3 text-sm" key={key}><span className="font-mono">{key}</span><span>{value.rate} · {value.effectiveOn} {value.note && `· ${value.note}`}</span></div>)}</div></section>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <Label className="grid gap-1">{label}{children}</Label> }

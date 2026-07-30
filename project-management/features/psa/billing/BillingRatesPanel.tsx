'use client'

/** Billing rate management — cascade rate cards. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useBillingRatesStore } from '../../../stores/entities'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'
import { formatMoney } from '../../../lib/billing/formatMoney'
import type { BillingRateScope } from '../../../types'

type Props = { workspaceId: string }

export function BillingRatesPanel({ workspaceId }: Props) {
  const rates = useBillingRatesStore((s) => s.list().filter((r) => r.workspaceId === workspaceId))
  const add = useBillingRatesStore((s) => s.add)
  const [scope, setScope] = useState<BillingRateScope>('workspace')
  const [role, setRole] = useState('Senior')
  const [hourlyRate, setHourlyRate] = useState('275')

  const create = async () => {
    const rate = parseFloat(hourlyRate)
    if (!rate) return
    await add({
      id: newId(),
      workspaceId,
      scope,
      role,
      hourlyRate: rate,
      currency: 'USD',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      createdAt: now(),
    })
  }

  return (
    <div className="space-y-4">
      <div className="tl-card grid gap-3 p-4 shadow-paper-sm md:grid-cols-4">
        <Select value={scope} onValueChange={(v) => setScope(v as BillingRateScope)}>
          <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">{(['workspace', 'role', 'user_default', 'client', 'project', 'matter', 'team'] as const).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} className="tl-input" />
        <Input placeholder="Rate" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="tl-input font-mono tabular-nums" />
        <Button className="tl-btn-primary border-0" onClick={() => void create()}>Add rate</Button>
      </div>
      <div className="tl-card overflow-hidden shadow-paper-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
            <th className="px-4 py-2">Scope</th><th className="px-4 py-2">Role</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2">Effective</th>
          </tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-4 py-2">{r.scope}</td>
                <td className="px-4 py-2">{r.role ?? '—'}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(r.hourlyRate, r.currency)}/hr</td>
                <td className="px-4 py-2 font-mono tabular-nums">{r.effectiveFrom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

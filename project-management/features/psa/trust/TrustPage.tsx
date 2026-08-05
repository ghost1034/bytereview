'use client'

/** Trust accounting — deposits, withdrawals, low-balance alerts. */
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePageMeta } from '../../../hooks/usePageMeta'
import { useWorkspaceContext } from '../../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../../stores/auth'
import { useClientsStore, useTrustTransactionsStore } from '../../../stores/entities'
import { newId } from '../../../lib/ids'
import { now } from '../../../lib/time'
import { formatMoney } from '../../../lib/billing/formatMoney'

const LOW_BALANCE_THRESHOLD = 5000

export function TrustPage() {
  const { workspaceId } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const clients = useClientsStore((s) => s.list().filter((c) => c.workspaceId === workspaceId && !c.archived))
  const txs = useTrustTransactionsStore((s) => s.list().filter((t) => t.workspaceId === workspaceId))
  const addTx = useTrustTransactionsStore((s) => s.add)
  const updateClient = useClientsStore((s) => s.update)
  const [clientId, setClientId] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit')

  usePageMeta({ breadcrumbs: [{ label: 'Trust accounting' }] })

  const record = async () => {
    if (!workspaceId || !userId || !clientId) return
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    const client = clients.find((c) => c.id === clientId)
    if (!client) return
    const signed = type === 'deposit' ? amt : -amt
    const balanceAfter = (client.retainerBalance ?? 0) + signed
    await addTx({
      id: newId(),
      workspaceId,
      clientId,
      type,
      amount: amt,
      currency: client.defaultCurrency,
      balanceAfter,
      recordedById: userId,
      createdAt: now(),
    })
    await updateClient(clientId, { retainerBalance: balanceAfter })
    setAmount('')
  }

  if (!workspaceId) return null

  return (
    <div className="space-y-4" data-tour-page="trust">
      <h1 className="font-serif text-2xl">Trust accounting</h1>
      <div className="tl-card grid gap-3 p-4 shadow-paper-sm md:grid-cols-4">
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="tl-input"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]">{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => setType(v as 'deposit' | 'withdrawal')}>
          <SelectTrigger className="tl-input"><SelectValue /></SelectTrigger>
          <SelectContent className="tl-popover-surface z-[100]"><SelectItem value="deposit">Deposit</SelectItem><SelectItem value="withdrawal">Withdrawal</SelectItem></SelectContent>
        </Select>
        <Input placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="tl-input font-mono tabular-nums" />
        <Button className="tl-btn-primary border-0" onClick={() => void record()}><Plus className="mr-1 h-4 w-4" /> Record</Button>
      </div>
      <div className="tl-card overflow-hidden shadow-paper-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
            <th className="px-4 py-2">Client</th><th className="px-4 py-2 text-right">Balance</th><th className="px-4 py-2">Alert</th>
          </tr></thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(c.retainerBalance ?? 0, c.defaultCurrency)}</td>
                <td className="px-4 py-2 text-sm" style={{ color: (c.retainerBalance ?? 0) < LOW_BALANCE_THRESHOLD ? 'var(--danger)' : 'var(--ink-muted)' }}>
                  {(c.retainerBalance ?? 0) < LOW_BALANCE_THRESHOLD ? 'Low balance — request top-up' : 'OK'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tl-card overflow-hidden shadow-paper-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left" style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}>
            <th className="px-4 py-2">Date</th><th className="px-4 py-2">Type</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Balance</th>
          </tr></thead>
          <tbody>
            {txs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => (
              <tr key={t.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-4 py-2 font-mono tabular-nums">{t.createdAt.slice(0, 10)}</td>
                <td className="px-4 py-2">{t.type}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(t.amount, t.currency)}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMoney(t.balanceAfter, t.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

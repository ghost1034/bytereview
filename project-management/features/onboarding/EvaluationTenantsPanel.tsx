'use client'

/**
 * Settings panel — spin up / reset evaluation tenants (internal flag only).
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  EVALUATION_TENANTS,
  provisionAllEvaluationTenants,
  provisionEvaluationTenant,
  type EvaluationTenantId,
} from '../../lib/evaluation/provisionEvaluationTenant'
import { exportEvalSnapshot, getEvalTenantMeta, importEvalSnapshot } from '../../lib/evaluation/evaluationMetaStore'
import { isInternalEvalEnabled } from '../../lib/evaluation/isInternalEvalEnabled'

export function EvaluationTenantsPanel() {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmTenant, setConfirmTenant] = useState<(typeof EVALUATION_TENANTS)[number] | null>(null)
  const [confirmPhrase, setConfirmPhrase] = useState('')

  if (!isInternalEvalEnabled()) return null

  const resetTenant = async (id: EvaluationTenantId) => {
    setBusy(id)
    try {
      await provisionEvaluationTenant(id)
    } finally {
      setBusy(null)
      setConfirmTenant(null)
      setConfirmPhrase('')
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground space-y-4 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-sans text-lg">Evaluation tenants</h2>
          <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Internal fixtures for Sales, CS, and Support walkthroughs.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(busy)}
          onClick={() => void provisionAllEvaluationTenants()}
        >
          Provision all
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: 'hsl(var(--border))' }}>
              <th className="py-2 pr-3">Tenant</th>
              <th className="py-2 pr-3">Vertical</th>
              <th className="py-2 pr-3">Stats</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {EVALUATION_TENANTS.map((t) => {
              const meta = getEvalTenantMeta(t.id)
              return (
                <tr key={t.id} className="border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                  <td className="py-2 pr-3 font-medium">{t.name}</td>
                  <td className="py-2 pr-3">
                    <Badge variant="secondary">{t.vertical}</Badge>
                  </td>
                  <td className="py-2 pr-3" style={{ color: 'hsl(var(--foreground-muted))' }}>
                    {meta
                      ? `${meta.projectCount} projects · ${meta.taskCount} tasks · ${new Date(meta.lastProvisionedAt).toLocaleDateString()}`
                      : 'Not provisioned'}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === t.id}
                        onClick={() => setConfirmTenant(t)}
                      >
                        Reset & re-provision
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(busy)}
                        onClick={() => void provisionEvaluationTenant(t.id)}
                      >
                        Switch into tenant
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const blob = new Blob([exportEvalSnapshot()], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'tasklytic-eval-snapshot.json'
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          Export snapshot
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const raw = window.prompt('Paste evaluation snapshot JSON')
            if (raw) importEvalSnapshot(raw)
          }}
        >
          Import snapshot
        </Button>
      </div>

      <Dialog open={Boolean(confirmTenant)} onOpenChange={(o) => !o && setConfirmTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset evaluation tenant</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Type <strong>reset {confirmTenant?.name}</strong> to wipe and re-provision this fixture.
          </p>
          <Input value={confirmPhrase} onChange={(e) => setConfirmPhrase(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTenant(null)}>
              Cancel
            </Button>
            <Button
              className=" border-0"
              disabled={confirmPhrase !== `reset ${confirmTenant?.name}` || !confirmTenant}
              onClick={() => confirmTenant && void resetTenant(confirmTenant.id)}
            >
              Reset & re-provision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

/** Workspace settings — Billing tab with plan and payment CTAs. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ContactSalesModal } from '../payment/ContactSalesModal'
import { resolveWorkspacePlan } from '../../lib/workspaces/defaults'
import type { User, Workspace } from '../../types'

type Props = {
  workspace: Workspace
  currentUser: User | undefined
}

export function WorkspaceBillingTab({ workspace, currentUser }: Props) {
  const plan = resolveWorkspacePlan(workspace.plan)
  const seatsUsed = workspace.memberIds.length
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="font-medium">Billing</h2>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Plan and seat usage for {workspace.name}</p>
      </div>

      <div className="tl-card space-y-4 p-5 shadow-paper-sm">
        <div className="flex items-center justify-between">
          <span className="font-serif text-lg capitalize">{plan.tier} plan</span>
          <Badge variant="secondary">{seatsUsed} / {plan.seatLimit} seats</Badge>
        </div>
        {plan.renewsAt && (
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Renews {plan.renewsAt}</p>
        )}
        <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--bg-muted)' }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (seatsUsed / plan.seatLimit) * 100)}%`,
              background: seatsUsed >= plan.seatLimit ? 'var(--danger)' : 'var(--primary)',
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="tl-btn-primary" disabled={!currentUser} onClick={() => setUpgradeOpen(true)}>
            Upgrade plan
          </Button>
          <Button variant="outline" disabled={!currentUser} onClick={() => setManageOpen(true)}>
            Manage payment method
          </Button>
        </div>
      </div>

      {currentUser && (
        <>
          <ContactSalesModal
            open={upgradeOpen}
            onOpenChange={setUpgradeOpen}
            workspaceId={workspace.id}
            userId={currentUser.id}
            type="upgrade"
            title="Upgrade your plan"
          />
          <ContactSalesModal
            open={manageOpen}
            onOpenChange={setManageOpen}
            workspaceId={workspace.id}
            userId={currentUser.id}
            type="manage_payment"
            title="Manage payment method"
          />
        </>
      )}
    </div>
  )
}

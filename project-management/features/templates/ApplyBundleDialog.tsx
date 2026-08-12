'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { applyBundle, unapplyBundle } from '../../lib/templates/bundles'
import { useBundlesStore } from '../../stores/entities'

export function ApplyBundleDialog({ open, onOpenChange, projectId, workspaceId, actorId }: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; workspaceId: string; actorId: string }) {
  const bundles = useBundlesStore((state) => state.list().filter((bundle) => bundle.workspaceId === workspaceId))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Apply bundle</DialogTitle></DialogHeader>
    <div className="space-y-2">{bundles.map((bundle) => {
      const applied = bundle.appliedToProjectIds.includes(projectId)
      return <div key={bundle.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{bundle.iconEmoji} {bundle.name}</p><p className="text-xs">{bundle.sectionNames.length} sections · {bundle.taskTemplates.length} starter tasks</p></div><Button variant={applied ? 'outline' : 'default'} onClick={() => void (applied ? unapplyBundle(bundle, projectId) : applyBundle(bundle, projectId, workspaceId, actorId)).then(() => onOpenChange(false))}>{applied ? 'Unapply' : 'Apply'}</Button></div>
    })}{!bundles.length ? <p className="text-sm">No bundles are available.</p> : null}</div>
  </DialogContent></Dialog>
}

'use client'

/** Settings → Workspace danger zone — reset projects/tasks and reprovision a starter template. */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWorkspaceContext } from '../../hooks/useWorkspaceContext'
import { useAuthStore } from '../../stores/auth'
import { recommendedTemplatesForIndustry } from '../../lib/provisioning/industryRecommendations'
import { resetWorkspaceContent } from './resetWorkspace'

export function WorkspaceResetPanel() {
  const { workspaceId, workspace } = useWorkspaceContext()
  const userId = useAuthStore((s) => s.currentUserId)
  const [open, setOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (!workspaceId || !userId || !workspace) return null

  const confirmText = `reset ${workspace.name}`
  const templateId = recommendedTemplatesForIndustry(workspace.profile?.industry)[0]

  const runReset = async () => {
    setBusy(true)
    try {
      await resetWorkspaceContent(workspaceId, userId, workspace.name, templateId)
      setDone(true)
      setOpen(false)
      setPhrase('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground space-y-3 border p-4 shadow-sm" style={{ borderColor: 'hsl(var(--destructive))' }}>
      <h2 className="font-medium" style={{ color: 'hsl(var(--destructive))' }}>
        Reset workspace content
      </h2>
      <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
        Deletes all projects, tasks, goals, and portfolios. Members, billing, and integrations are preserved.
        A fresh starter project is provisioned afterward.
      </p>
      {done ? (
        <p className="text-sm" style={{ color: 'hsl(var(--primary))' }}>
          Workspace reset. Your starter project is ready.
        </p>
      ) : (
        <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
          Reset workspace
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset workspace</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: 'hsl(var(--foreground-muted))' }}>
            Type <strong>{confirmText}</strong> to confirm.
          </p>
          <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} className="rounded-md border border-input bg-background text-foreground" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={phrase !== confirmText || busy} onClick={() => void runReset()}>
              Reset workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

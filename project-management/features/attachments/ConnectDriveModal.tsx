'use client'

/**
 * Cloud drive connection failure details for configured providers.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { CloudDriveProvider } from '../../lib/cloudDrive'
import { CLOUD_DRIVE_LABELS } from '../../lib/cloudDrive'

type Props = {
  provider: CloudDriveProvider | null
  message?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Shown when an otherwise supported cloud drive connection fails. */
export function ConnectDriveModal({ provider, message, open, onOpenChange }: Props) {
  const label = provider ? CLOUD_DRIVE_LABELS[provider] : 'Cloud drive'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="tl-dialog-surface max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {label}</DialogTitle>
          <DialogDescription style={{ color: 'var(--ink-muted)' }}>
            {message ?? `${label} is temporarily unavailable. Try again later.`}
          </DialogDescription>
        </DialogHeader>
        <Button className="tl-btn-primary w-full border-0" onClick={() => onOpenChange(false)}>
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  )
}

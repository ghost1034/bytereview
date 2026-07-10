'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const STORAGE_KEY = 'esign-development-disclaimer-acknowledged'

export function DevelopmentDisclaimer() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const acknowledged = window.sessionStorage.getItem(STORAGE_KEY)
    if (!acknowledged) {
      setOpen(true)
    }
  }, [])

  const handleAcknowledge = () => {
    window.sessionStorage.setItem(STORAGE_KEY, 'true')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : handleAcknowledge())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-lg bg-warning-soft text-warning" aria-hidden>
            <AlertTriangle className="size-5" />
          </div>
          <DialogTitle>This feature is in development</DialogTitle>
          <DialogDescription>
            The e-signature tools are an early work in progress and are not intended for
            public use. Do not rely on them for legally binding agreements or to store
            sensitive documents. Functionality may change or be removed without notice.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleAcknowledge}>I understand</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

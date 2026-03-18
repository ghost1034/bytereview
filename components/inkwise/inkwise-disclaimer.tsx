'use client'

import { useEffect, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const STORAGE_KEY = 'cpaa_inkwise_disclaimer_seen_v1'

export function InkwiseDisclaimer() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setOpen(true)
      }
    } catch {
      // localStorage unavailable — silently skip
    }
  }, [])

  function handleAcknowledge() {
    setOpen(false)
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    } catch {
      // localStorage unavailable
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Inkwise — Technical Revamp in Progress</AlertDialogTitle>
          <AlertDialogDescription>
            Inkwise is currently undergoing a technical revamp to integrate the latest
            state-of-the-art AI models. During this transition some features may not be
            fully functional. We apologize for the inconvenience and appreciate your
            patience.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleAcknowledge}>
            Got it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

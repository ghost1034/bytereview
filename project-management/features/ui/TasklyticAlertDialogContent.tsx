'use client'

/** AlertDialogContent compatibility wrapper using the shared surface primitive. */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { AlertDialogContent } from '@/components/ui/alert-dialog'

type Props = ComponentPropsWithoutRef<typeof AlertDialogContent>

export const TasklyticAlertDialogContent = forwardRef<ElementRef<typeof AlertDialogContent>, Props>(
  ({ className, ...props }, ref) => (
    <AlertDialogContent ref={ref} className={className} {...props} />
  )
)
TasklyticAlertDialogContent.displayName = 'TasklyticAlertDialogContent'

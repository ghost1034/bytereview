'use client'

/** AlertDialogContent with opaque Tasklytic portal surface styling. */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { AlertDialogContent } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

type Props = ComponentPropsWithoutRef<typeof AlertDialogContent>

export const TasklyticAlertDialogContent = forwardRef<ElementRef<typeof AlertDialogContent>, Props>(
  ({ className, ...props }, ref) => (
    <AlertDialogContent ref={ref} className={cn('tl-dialog-surface', className)} {...props} />
  )
)
TasklyticAlertDialogContent.displayName = 'TasklyticAlertDialogContent'

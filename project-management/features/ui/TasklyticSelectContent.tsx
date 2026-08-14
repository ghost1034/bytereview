'use client'

/** SelectContent compatibility wrapper retaining Tasklytic's overlay order. */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { SelectContent } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Props = ComponentPropsWithoutRef<typeof SelectContent>

export const TasklyticSelectContent = forwardRef<ElementRef<typeof SelectContent>, Props>(
  ({ className, ...props }, ref) => (
    <SelectContent ref={ref} className={cn('z-[100]', className)} {...props} />
  )
)
TasklyticSelectContent.displayName = 'TasklyticSelectContent'

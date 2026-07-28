'use client'

/** SelectContent with opaque Tasklytic portal surface styling. */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { SelectContent } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Props = ComponentPropsWithoutRef<typeof SelectContent>

export const TasklyticSelectContent = forwardRef<ElementRef<typeof SelectContent>, Props>(
  ({ className, ...props }, ref) => (
    <SelectContent ref={ref} className={cn('tl-popover-surface z-[100]', className)} {...props} />
  )
)
TasklyticSelectContent.displayName = 'TasklyticSelectContent'

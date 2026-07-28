'use client'

/**
 * PopoverContent for Tasklytic — portaled menus need tl-popover-surface tokens
 * because Radix renders outside `.tasklytic-root`.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Props = ComponentPropsWithoutRef<typeof PopoverContent>

export const TasklyticPopoverContent = forwardRef<ElementRef<typeof PopoverContent>, Props>(
  ({ className, ...props }, ref) => (
    <PopoverContent
      ref={ref}
      className={cn('tl-popover-surface text-popover-foreground', className)}
      {...props}
    />
  )
)
TasklyticPopoverContent.displayName = 'TasklyticPopoverContent'

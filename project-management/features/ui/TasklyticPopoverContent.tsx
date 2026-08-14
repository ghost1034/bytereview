'use client'

/** PopoverContent compatibility wrapper using the shared surface primitive. */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Props = ComponentPropsWithoutRef<typeof PopoverContent>

export const TasklyticPopoverContent = forwardRef<ElementRef<typeof PopoverContent>, Props>(
  ({ className, ...props }, ref) => (
    <PopoverContent
      ref={ref}
      className={cn('text-popover-foreground', className)}
      {...props}
    />
  )
)
TasklyticPopoverContent.displayName = 'TasklyticPopoverContent'

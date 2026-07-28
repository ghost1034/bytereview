'use client'

/** TooltipContent with opaque Tasklytic portal surface styling. */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Props = ComponentPropsWithoutRef<typeof TooltipContent>

export const TasklyticTooltipContent = forwardRef<ElementRef<typeof TooltipContent>, Props>(
  ({ className, ...props }, ref) => (
    <TooltipContent ref={ref} className={cn('tl-popover-surface text-xs', className)} {...props} />
  )
)
TasklyticTooltipContent.displayName = 'TasklyticTooltipContent'

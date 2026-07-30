'use client'

/** DropdownMenuContent with Tasklytic portal surface styling. */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type Props = ComponentPropsWithoutRef<typeof DropdownMenuContent>

export const TasklyticDropdownMenuContent = forwardRef<ElementRef<typeof DropdownMenuContent>, Props>(
  ({ className, ...props }, ref) => (
    <DropdownMenuContent
      ref={ref}
      className={cn('tl-popover-surface z-[100]', className)}
      {...props}
    />
  )
)
TasklyticDropdownMenuContent.displayName = 'TasklyticDropdownMenuContent'

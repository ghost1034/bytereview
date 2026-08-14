'use client'

/** DropdownMenuContent compatibility wrapper retaining Tasklytic's overlay order. */
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { DropdownMenuContent } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type Props = ComponentPropsWithoutRef<typeof DropdownMenuContent>

export const TasklyticDropdownMenuContent = forwardRef<ElementRef<typeof DropdownMenuContent>, Props>(
  ({ className, ...props }, ref) => (
    <DropdownMenuContent
      ref={ref}
      className={cn('z-[100]', className)}
      {...props}
    />
  )
)
TasklyticDropdownMenuContent.displayName = 'TasklyticDropdownMenuContent'

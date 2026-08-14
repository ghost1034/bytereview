'use client'

/** DialogContent wrapper with explicit focus trap for Tasklytic modals. */
import {
  useRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
} from 'react'
import { DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '../../hooks/useFocusTrap'

type Props = ComponentPropsWithoutRef<typeof DialogContent> & {
  trapFocus?: boolean
}

export const TasklyticDialogContent = forwardRef<ElementRef<typeof DialogContent>, Props>(
  ({ trapFocus = true, className, children, ...props }, ref) => {
    const containerRef = useRef<ElementRef<typeof DialogContent>>(null)
    useFocusTrap(trapFocus, containerRef)

    return (
      <DialogContent
        ref={(node) => {
          containerRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        className={cn('bg-background', className)}
        {...props}
      >
        {children}
      </DialogContent>
    )
  }
)
TasklyticDialogContent.displayName = 'TasklyticDialogContent'

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
        // `tl-dialog-surface` supplies Tasklytic surface/ink/border vars (the dialog
        // is portaled outside `.tasklytic-root`); `bg-background` guarantees an opaque
        // backdrop even when a caller's inline `var(--bg-elevated)` would otherwise fail.
        className={cn('tl-dialog-surface bg-background', className)}
        {...props}
      >
        {children}
      </DialogContent>
    )
  }
)
TasklyticDialogContent.displayName = 'TasklyticDialogContent'

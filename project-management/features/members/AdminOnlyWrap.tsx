'use client'

/** Wraps a control with admin-only tooltip when disabled. */
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type Props = {
  allowed: boolean
  children: ReactNode
  message?: string
}

export function AdminOnlyWrap({
  allowed,
  children,
  message = 'Only admins can edit',
}: Props) {
  if (allowed) return <>{children}</>

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed opacity-60">{children}</span>
        </TooltipTrigger>
        <TooltipContent>{message}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

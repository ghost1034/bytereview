'use client'

import { toast } from '@/hooks/use-toast'

export type TasklyticToastStatus = 'success' | 'error' | 'info' | 'warning'

const BORDER: Record<TasklyticToastStatus, string> = {
  success: 'hsl(var(--success))',
  error: 'hsl(var(--destructive))',
  info: 'hsl(var(--info))',
  warning: 'hsl(var(--warning))',
}

/** Shared toast surface with a semantic status border. */
export function tasklyticToast(
  title: string,
  options?: { description?: string; status?: TasklyticToastStatus; duration?: number }
) {
  const status = options?.status ?? 'info'
  return toast({
    title,
    description: options?.description,
    duration: options?.duration ?? 5000,
    className: 'border-l-4',
    style: {
      borderLeftColor: BORDER[status],
    },
  })
}

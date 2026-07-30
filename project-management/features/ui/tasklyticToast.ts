'use client'

import { toast } from '@/hooks/use-toast'

export type TasklyticToastStatus = 'success' | 'error' | 'info' | 'warning'

const BORDER: Record<TasklyticToastStatus, string> = {
  success: '#6b8e5a',
  error: '#bc4a3f',
  info: '#5c7a8c',
  warning: '#c99846',
}

/** Warm Tasklytic toast with opaque portal surface and status-colored left border. */
export function tasklyticToast(
  title: string,
  options?: { description?: string; status?: TasklyticToastStatus; duration?: number }
) {
  const status = options?.status ?? 'info'
  return toast({
    title,
    description: options?.description,
    duration: options?.duration ?? 5000,
    className: 'tl-toast tl-popover-surface border-l-4',
    style: {
      borderLeftColor: BORDER[status],
    },
  })
}

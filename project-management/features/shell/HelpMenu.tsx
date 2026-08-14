'use client'

import { BookOpen, HelpCircle, Keyboard, MessageSquare, RotateCcw, Settings2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type Props = {
  onFeedback: () => void
  onShortcuts: () => void
  onRestartTour: () => void
  onRestartSetup?: () => void
}

export function HelpMenu({ onFeedback, onShortcuts, onRestartTour, onRestartSetup }: Props) {
  const items = [
    { label: 'Send feedback', icon: MessageSquare, onClick: onFeedback },
    { label: 'Keyboard shortcuts', icon: Keyboard, onClick: onShortcuts },
    { label: 'Docs', icon: BookOpen, href: '/docs' as const },
    { label: 'Restart product tour', icon: RotateCcw, onClick: onRestartTour },
    ...(onRestartSetup
      ? [{ label: 'Restart setup wizard', icon: Settings2, onClick: onRestartSetup }]
      : []),
  ]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Help"
        >
          <HelpCircle className="h-5 w-5" style={{ color: 'hsl(var(--foreground-muted))' }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="end">
        {items.map((item) => {
          const Icon = item.icon
          if ('href' in item) {
            return (
              <a
                key={item.label}
                href={item.href}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-[hsl(var(--surface-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{ color: 'hsl(var(--foreground-muted))' }}
              >
                <Icon className="h-4 w-4" /> {item.label}
              </a>
            )
          }
          return (
            <button
              key={item.label}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-[hsl(var(--surface-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ color: 'hsl(var(--foreground-muted))' }}
              onClick={item.onClick}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

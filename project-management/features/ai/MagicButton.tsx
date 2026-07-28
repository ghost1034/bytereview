'use client'

/**
 * Reusable inline magic button — sparkles + "AI" label for contextual AI actions.
 * Disabled when AI is paused or disabled in settings.
 */
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAiSettingsStore } from '../../lib/ai'

type Props = {
  label?: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

export function MagicButton({ label = 'AI', onClick, disabled, className }: Props) {
  const paused = useAiSettingsStore((s) => s.paused)
  const enabled = useAiSettingsStore((s) => s.enabled)
  const off = disabled || paused || !enabled

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={off}
      className={`gap-1 text-xs ${off ? 'opacity-40' : ''} ${className ?? ''}`}
      onClick={onClick}
    >
      <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
      {label}
    </Button>
  )
}

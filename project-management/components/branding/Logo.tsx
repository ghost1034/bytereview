/** Tasklytic logomark + wordmark. */
import { Check } from 'lucide-react'

type Props = { compact?: boolean }

export function TasklyticLogo({ compact }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
        style={{ background: 'hsl(var(--primary))' }}
        aria-hidden
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </div>
      {!compact && (
        <span className="font-sans text-lg font-medium tracking-tight" style={{ color: 'hsl(var(--foreground))' }}>
          Tasklytic
        </span>
      )}
    </div>
  )
}

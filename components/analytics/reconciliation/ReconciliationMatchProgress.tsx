import { BrainCircuit } from 'lucide-react'

interface ReconciliationMatchProgressProps {
  configuredPassCount: number
}

export function ReconciliationMatchProgress({
  configuredPassCount,
}: ReconciliationMatchProgressProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-sm">
      <div
        className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-8 text-center shadow-xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="relative mx-auto size-20">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" aria-hidden />
          <div
            className="absolute inset-0 animate-spin rounded-full border-4 border-primary border-t-transparent"
            style={{ animationDuration: '1.5s' }}
            aria-hidden
          />
          <div className="absolute inset-0 flex items-center justify-center text-primary">
            <BrainCircuit className="size-8" aria-hidden />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-semibold text-foreground">AI Matching Engine</h3>
          <p className="mt-1 text-sm font-semibold text-foreground">Matching in progress</p>
          <p className="mt-1 text-sm text-foreground-muted">
            Submitted {configuredPassCount} configured pass
            {configuredPassCount === 1 ? '' : 'es'}. Results will appear when matching is complete.
          </p>
        </div>
      </div>
    </div>
  )
}

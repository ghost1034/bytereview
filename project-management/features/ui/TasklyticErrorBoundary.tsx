'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { getMutationDiagnostics } from '../../lib/mutationLog'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Global error boundary — recovery card with reload and diagnostics copy. */
export class TasklyticErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TasklyticErrorBoundary]', error, info.componentStack)
  }

  copyDiagnostics = async () => {
    const payload = JSON.stringify(
      { error: this.state.error?.message, stack: this.state.error?.stack, mutations: getMutationDiagnostics() },
      null,
      2
    )
    await navigator.clipboard.writeText(payload)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="tasklytic-root flex min-h-[320px] items-center justify-center p-6">
          <div className="tl-card max-w-md space-y-4 p-6 text-center shadow-paper-md">
            <h2 className="font-serif text-xl">Something went wrong</h2>
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
              Tasklytic hit an unexpected error. Your data is still saved locally.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="tl-btn-primary border-0" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button variant="outline" onClick={() => void this.copyDiagnostics()}>
                Copy diagnostics
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

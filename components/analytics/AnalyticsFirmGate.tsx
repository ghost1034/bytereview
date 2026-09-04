'use client'

import type { ReactNode } from 'react'

import { AnalyticsOnboarding } from '@/components/analytics/AnalyticsOnboarding'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/ui/loading-state'
import { useAnalyticsFirmOnboardingStatus } from '@/hooks/useAnalyticsTeam'
import { useAuth } from '@/contexts/AuthContext'

function GateStatus({
  label,
  action,
}: {
  label: string
  action?: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
      <LoadingState variant="page" label={label} />
      <p className="text-sm text-foreground-muted">{label}</p>
      {action}
    </div>
  )
}

export function AnalyticsFirmGate({ children, productName = 'CPA Analytics' }: { children: ReactNode; productName?: string }) {
  const { user, loading: authLoading } = useAuth()
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
  } = useAnalyticsFirmOnboardingStatus({ enabled: !!user && !authLoading })

  if (authLoading || !user) {
    return <GateStatus label={`Loading ${productName}…`} />
  }

  if (isPending) {
    return <GateStatus label="Checking firm setup…" />
  }

  if (isError) {
    const message =
      error instanceof Error ? error.message : 'Could not load firm setup.'
    return (
      <GateStatus
        label={message}
        action={
          <Button type="button" variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    )
  }

  if (data?.needs_onboarding) {
    return <AnalyticsOnboarding productName={productName} />
  }

  return <>{children}</>
}

export default AnalyticsFirmGate

'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type StateProps = {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  role?: 'status' | 'alert'
  children?: ReactNode
}

function DataState({
  title,
  description,
  actionLabel,
  onAction,
  role = 'status',
  children,
}: StateProps) {
  return (
    <section
      className="rounded-lg border border-border bg-card text-card-foreground flex min-h-40 flex-col items-center justify-center gap-2 px-6 py-8 text-center"
      role={role}
    >
      <h2 className="font-sans text-lg text-[hsl(var(--foreground))]">{title}</h2>
      {description ? (
        <p className="max-w-md text-sm text-[hsl(var(--foreground-muted))]">{description}</p>
      ) : null}
      {children}
      {actionLabel && onAction ? (
        <Button className=" mt-2 border-0" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </section>
  )
}

export function TasklyticLoadingState({ label = 'Loading…' }: { label?: string }) {
  return <DataState title={label}><span className="sr-only">Please wait</span></DataState>
}

export function TasklyticEmptyDataState({ title = 'Nothing here yet', description }: Partial<StateProps>) {
  return <DataState title={title} description={description} />
}

export function TasklyticForbiddenState({ description }: { description?: string }) {
  return (
    <DataState
      role="alert"
      title="You do not have permission to view this"
      description={description ?? 'Ask a workspace administrator if you need access.'}
    />
  )
}

export function TasklyticNotFoundState({ description }: { description?: string }) {
  return <DataState title="This record was not found" description={description} />
}

export function TasklyticConflictState({
  onReload,
  description,
}: {
  onReload: () => void
  description?: string
}) {
  return (
    <DataState
      role="alert"
      title="A newer version is available"
      description={description ?? 'Someone else changed this record. Reload the current version before editing again.'}
      actionLabel="Reload current version"
      onAction={onReload}
    />
  )
}

export function TasklyticRetryState({
  onRetry,
  description,
}: {
  onRetry: () => void
  description?: string
}) {
  return (
    <DataState
      role="alert"
      title="We could not load this data"
      description={description}
      actionLabel="Try again"
      onAction={onRetry}
    />
  )
}

export function TasklyticServiceErrorState({
  onRetry,
  description,
}: {
  onRetry: () => void
  description?: string
}) {
  return (
    <DataState
      role="alert"
      title="Project management is temporarily unavailable"
      description={description ?? 'Your saved work is unaffected. Retry when the service is available.'}
      actionLabel="Retry"
      onAction={onRetry}
    />
  )
}

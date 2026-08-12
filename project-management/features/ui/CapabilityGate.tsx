'use client'

import type { ReactNode } from 'react'
import { hasCapability } from '../../lib/authorization'
import type {
  TasklyticCapabilities,
  TasklyticCapability,
} from '../../lib/repository/types'
import { TasklyticForbiddenState } from './TasklyticDataStates'

type Props = {
  capabilities: TasklyticCapabilities | null | undefined
  require: TasklyticCapability
  children: ReactNode
  fallback?: ReactNode
}

/** Shared UI boundary mirroring the backend action-capability registry. */
export function CapabilityGate({
  capabilities,
  require,
  children,
  fallback,
}: Props) {
  if (!hasCapability(capabilities, require)) {
    return fallback ?? <TasklyticForbiddenState />
  }
  return children
}

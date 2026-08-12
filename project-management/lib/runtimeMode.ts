export type TasklyticPersistenceMode = 'backend' | 'local-test' | 'local-evaluation'

type RuntimeEnvironment = {
  NODE_ENV?: string
  NEXT_PUBLIC_INTERNAL_EVAL?: string
}

/**
 * Authenticated customer work always uses the backend repository. Browser
 * persistence is reserved for automated tests and explicitly enabled internal
 * evaluation tooling.
 */
export function resolveTasklyticPersistenceMode(
  env?: RuntimeEnvironment,
): TasklyticPersistenceMode {
  const internalEvaluation = env
    ? env.NEXT_PUBLIC_INTERNAL_EVAL
    : process.env.NEXT_PUBLIC_INTERNAL_EVAL
  const nodeEnvironment = env ? env.NODE_ENV : process.env.NODE_ENV

  if (internalEvaluation === 'true') return 'local-evaluation'
  if (nodeEnvironment === 'test') return 'local-test'
  return 'backend'
}

export function usesTasklyticBackend(): boolean {
  return resolveTasklyticPersistenceMode() === 'backend'
}

export function allowsLocalTasklyticPersistence(): boolean {
  return !usesTasklyticBackend()
}

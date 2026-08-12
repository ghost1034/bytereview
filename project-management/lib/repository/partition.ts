/** Local repository partition used only by tests and internal evaluation tooling. */
export type RepositoryPartition = 'default' | `eval:${string}`

let activePartition: RepositoryPartition = 'default'

/** Returns the active localStorage key prefix for entity storage. */
export function getStoragePrefix(): string {
  if (activePartition.startsWith('eval:')) return `tasklytic:${activePartition}:v1`
  return 'tasklytic:v1'
}

/** Switches local test/evaluation reads and writes to an allowed namespace. */
export function setRepositoryPartition(partition: RepositoryPartition): void {
  activePartition = partition
}

/** Returns the active repository partition. */
export function getRepositoryPartition(): RepositoryPartition {
  return activePartition
}

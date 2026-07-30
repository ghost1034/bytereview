/** Repository storage partition — isolates trial and evaluation tenants from real accounts. */
export type RepositoryPartition = 'default' | 'trial' | `eval:${string}`

let activePartition: RepositoryPartition = 'default'

/** Returns the active localStorage key prefix for entity storage. */
export function getStoragePrefix(): string {
  if (activePartition === 'trial') return 'tasklytic:trial:v1'
  if (activePartition.startsWith('eval:')) return `tasklytic:${activePartition}:v1`
  return 'tasklytic:v1'
}

/** Switches entity reads/writes to the default, trial, or evaluation namespace. */
export function setRepositoryPartition(partition: RepositoryPartition): void {
  activePartition = partition
}

/** Returns the active repository partition. */
export function getRepositoryPartition(): RepositoryPartition {
  return activePartition
}

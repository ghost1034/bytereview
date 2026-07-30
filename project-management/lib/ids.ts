/** Generate a new UUID for Tasklytic entities. */
export function newId(): string {
  return crypto.randomUUID()
}

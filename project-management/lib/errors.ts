/** Convert browser events and other non-Error rejection values into useful errors. */
export function normalizeUnknownError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) return value
  if (typeof value === 'string' && value.trim()) return new Error(value)

  const error = new Error(fallbackMessage)
  ;(error as Error & { cause?: unknown }).cause = value
  return error
}

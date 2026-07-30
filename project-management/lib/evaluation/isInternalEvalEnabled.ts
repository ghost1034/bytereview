/** Whether internal evaluation tenant UI is enabled for this environment. */
export function isInternalEvalEnabled(): boolean {
  if (typeof process === 'undefined') return false
  return process.env.NEXT_PUBLIC_INTERNAL_EVAL === 'true'
}

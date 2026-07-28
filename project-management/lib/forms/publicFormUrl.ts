/**
 * Public form URL helpers.
 */

/** Absolute or relative URL for the public form submission page. */
export function publicFormUrl(formId: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/dashboard/tasklytic/public/form/${formId}`
  }
  return `/dashboard/tasklytic/public/form/${formId}`
}

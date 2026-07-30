/**
 * Public form URL helpers.
 */

/** Absolute or relative URL for the public form submission page. */
export function publicFormUrl(formId: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/project-management/forms/${formId}`
  }
  return `/project-management/forms/${formId}`
}

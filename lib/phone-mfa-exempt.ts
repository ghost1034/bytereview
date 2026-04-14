const PHONE_MFA_EXEMPT_EMAILS = new Set([
  'giorgi@itcare.ge',
])

function normalizeEmail(email?: string | null): string | null {
  const normalizedEmail = (email || '').trim().toLowerCase()
  return normalizedEmail || null
}

export function isPhoneMfaExemptEmail(email?: string | null): boolean {
  const normalizedEmail = normalizeEmail(email)
  return normalizedEmail !== null && PHONE_MFA_EXEMPT_EMAILS.has(normalizedEmail)
}

const DEFAULT_AUTHENTICATED_REDIRECT = "/dashboard"

export function normalizeAuthRedirectPath(path: string | null | undefined, fallback: string = DEFAULT_AUTHENTICATED_REDIRECT): string {
  const trimmedPath = (path || "").trim()

  if (!trimmedPath.startsWith("/") || trimmedPath.startsWith("//")) {
    return fallback
  }

  return trimmedPath
}

export function buildPhoneVerificationRedirect(path?: string | null): string {
  const redirectTo = normalizeAuthRedirectPath(path, DEFAULT_AUTHENTICATED_REDIRECT)

  if (redirectTo === DEFAULT_AUTHENTICATED_REDIRECT) {
    return "/complete-signup"
  }

  return `/complete-signup?redirectTo=${encodeURIComponent(redirectTo)}`
}

export function buildMfaEnrollmentRedirect(path?: string | null): string {
  return buildPhoneVerificationRedirect(path)
}

export function buildMfaChallengeRedirect(path?: string | null): string {
  const redirectTo = normalizeAuthRedirectPath(path, DEFAULT_AUTHENTICATED_REDIRECT)

  if (redirectTo === DEFAULT_AUTHENTICATED_REDIRECT) {
    return "/complete-signin"
  }

  return `/complete-signin?redirectTo=${encodeURIComponent(redirectTo)}`
}

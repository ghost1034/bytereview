export interface BillingLimitDetail {
  code: 'billing_limit_exceeded'
  unit: 'page' | 'token'
  used: number
  included: number
  remaining: number
  plan_code: string
}

export function getBillingLimitDetail(body: unknown): BillingLimitDetail | null {
  if (!body || typeof body !== 'object') return null
  const detail = (body as { detail?: unknown }).detail
  if (!detail || typeof detail !== 'object') return null
  const candidate = detail as Partial<BillingLimitDetail>
  if (
    candidate.code !== 'billing_limit_exceeded' ||
    (candidate.unit !== 'page' && candidate.unit !== 'token')
  ) {
    return null
  }
  return candidate as BillingLimitDetail
}

export function formatApiErrorMessage(status: number, body: unknown, fallback: string): string {
  const limit = status === 402 ? getBillingLimitDetail(body) : null
  if (limit) {
    const label = limit.unit === 'page' ? 'Page' : 'Token'
    return `${label} allowance exhausted. Upgrade your plan to continue.`
  }
  if (body && typeof body === 'object') {
    const candidate = body as { detail?: unknown; message?: unknown }
    if (typeof candidate.detail === 'string') return candidate.detail
    if (typeof candidate.message === 'string') return candidate.message
  }
  return fallback
}

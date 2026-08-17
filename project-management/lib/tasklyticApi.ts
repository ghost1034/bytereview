/**
 * Shared authenticated fetch helper for Tasklytic backend routes.
 */
import { getCurrentAuthToken } from '@/lib/firebase'

export const TASKLYTIC_API_BASE = '/api/tasklytic'
const FETCH_TIMEOUT_MS = 20_000

type ErrorDetail = Record<string, unknown>

export type TasklyticErrorContext = {
  sourceLabel?: string
  sourceDate?: string
  periodStart?: string
  periodEnd?: string
}

function objectDetail(value: unknown): ErrorDetail | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as ErrorDetail
    : undefined
}

export function tasklyticErrorCode(detail: unknown): string | undefined {
  const code = objectDetail(detail)?.code
  return typeof code === 'string' ? code : undefined
}

export function formatTasklyticErrorDetail(
  detail: unknown,
  fallback: string,
  context: TasklyticErrorContext = {},
): string {
  if (typeof detail === 'string') return detail
  const fields = objectDetail(detail)
  if (typeof fields?.message === 'string') return fields.message

  switch (tasklyticErrorCode(detail)) {
    case 'source_outside_invoice_period': {
      if (context.sourceLabel && context.sourceDate && context.periodStart && context.periodEnd) {
        return `${context.sourceLabel} dated ${context.sourceDate} is outside the selected invoice period ${context.periodStart} to ${context.periodEnd}. Update the period or exclude this source.`
      }
      return 'A selected invoice source is outside the selected invoice period. Update the period or exclude the source.'
    }
    case 'source_not_billable':
      return 'A selected invoice source is no longer approved or has already been invoiced. Refresh the sources and try again.'
    case 'billing_lock_conflict':
      return 'A selected invoice source is being billed by another request. Refresh the sources and try again.'
    case 'fx_quote_required': {
      const base = typeof fields?.baseCurrency === 'string' ? fields.baseCurrency : undefined
      const quote = typeof fields?.quoteCurrency === 'string' ? fields.quoteCurrency : undefined
      return base && quote
        ? `An exchange-rate quote from ${base} to ${quote} is required before this invoice can be created.`
        : 'An exchange-rate quote is required before this invoice can be created.'
    }
    case 'invoice_number_conflict':
      return 'That invoice number is already in use. Refresh invoices and try again.'
    case 'revision_conflict':
      return 'This record changed since it was loaded. Refresh it and try again.'
    default:
      return fallback
  }
}

export class TasklyticApiError extends Error {
  readonly code: string | undefined
  readonly sourceId: string | undefined

  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'TasklyticApiError'
    this.code = tasklyticErrorCode(detail)
    const sourceId = objectDetail(detail)?.sourceId
    this.sourceId = typeof sourceId === 'string' ? sourceId : undefined
  }
}

export function formatTasklyticApiError(
  error: unknown,
  context: TasklyticErrorContext = {},
): string {
  if (!(error instanceof TasklyticApiError)) {
    return error instanceof Error ? error.message : 'Tasklytic request failed'
  }
  return formatTasklyticErrorDetail(error.detail, error.message, context)
}

export function tasklyticApiErrorDiagnostics(error: unknown): string[] {
  if (!(error instanceof TasklyticApiError)) return []
  return [
    error.code ? `Code: ${error.code}` : undefined,
    error.sourceId ? `Source ID: ${error.sourceId}` : undefined,
    error.requestId ? `Request ID: ${error.requestId}` : undefined,
  ].filter((value): value is string => Boolean(value))
}

export async function tasklyticAuthHeaders(): Promise<Record<string, string>> {
  const token = await getCurrentAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Tasklytic API timed out after ${FETCH_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function tasklyticApiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await tasklyticAuthHeaders()
  const res = await fetchWithTimeout(`${TASKLYTIC_API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const fallback = `Tasklytic API ${path}: ${res.status}`
    let message = fallback
    let detail: unknown
    let requestId = res.headers.get('x-request-id') ?? res.headers.get('x-correlation-id') ?? undefined
    try {
      const body = await res.json()
      detail = body?.detail
      const bodyFields = objectDetail(body)
      const detailFields = objectDetail(detail)
      const bodyRequestId = bodyFields?.requestId ?? bodyFields?.request_id
        ?? detailFields?.requestId ?? detailFields?.request_id
      if (!requestId && typeof bodyRequestId === 'string') requestId = bodyRequestId
      message = formatTasklyticErrorDetail(detail, typeof bodyFields?.message === 'string' ? bodyFields.message : fallback)
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new TasklyticApiError(message, res.status, detail, requestId)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function tasklyticApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = await tasklyticAuthHeaders()
  return fetchWithTimeout(`${TASKLYTIC_API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...(init.headers ?? {}) },
  })
}

/** Authenticated streaming fetch without the normal request timeout. */
export async function tasklyticEventFetch(path: string, signal: AbortSignal): Promise<Response> {
  const headers = await tasklyticAuthHeaders()
  return fetch(`${TASKLYTIC_API_BASE}${path}`, {
    headers: { Accept: 'text/event-stream', ...headers },
    cache: 'no-store',
    signal,
  })
}

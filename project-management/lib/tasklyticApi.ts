/**
 * Shared authenticated fetch helper for Tasklytic backend routes.
 */
import { getCurrentAuthToken } from '@/lib/firebase'

export const TASKLYTIC_API_BASE = '/api/tasklytic'
const FETCH_TIMEOUT_MS = 20_000

export class TasklyticApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'TasklyticApiError'
  }
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
    let message = `Tasklytic API ${path}: ${res.status}`
    let detail: unknown
    try {
      const body = await res.json()
      detail = body?.detail
      message = typeof body?.detail === 'string' ? body.detail : body?.detail?.message || body?.message || message
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new TasklyticApiError(message, res.status, detail)
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

/**
 * Shared authenticated fetch helper for Tasklytic backend routes.
 */
import { getClientAuthToken } from '@/lib/dev-auth'

export const TASKLYTIC_API_BASE = '/api/tasklytic'
const FETCH_TIMEOUT_MS = 20_000

export async function tasklyticAuthHeaders(): Promise<Record<string, string>> {
  const token = await getClientAuthToken()
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
    try {
      const body = await res.json()
      message = body?.detail || body?.message || message
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message)
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

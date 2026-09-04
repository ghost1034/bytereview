import { getCurrentAuthToken } from '@/lib/firebase'

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message)
  }
}
type Query = Record<string, string | number | boolean | null | undefined>
export function qs(params?: Query) {
  const search = new URLSearchParams()
  Object.entries(params ?? {}).forEach(([key, value]) => { if (value != null && value !== '') search.set(key, String(value)) })
  return search.size ? `?${search}` : ''
}
async function api<T>(path: string, init: RequestInit = {}, raw = false): Promise<T> {
  const token = await getCurrentAuthToken()
  const response = await fetch(`/api/firmcrm${path}`, {
    ...init,
    cache: 'no-store',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((item: { msg: string }) => item.msg).join('; ') : `Request failed (${response.status})`
    throw new ApiError(response.status, message, body.code)
  }
  if (init.method && init.method !== 'GET' && !path.endsWith('/search')) window.dispatchEvent(new Event('firmcrm:changed'))
  if (raw) return response as T
  return response.status === 204 ? undefined as T : response.json()
}
export const get = <T,>(path: string, params?: Query) => api<T>(path + qs(params))
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
export const del = <T = void,>(path: string) => api<T>(path, { method: 'DELETE' })
export const postForm = <T,>(path: string, body: FormData) => api<T>(path, { method: 'POST', body })
export async function download(path: string, filename: string) {
  const response = await api<Response>(path, {}, true)
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

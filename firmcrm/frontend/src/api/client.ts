/* HTTP client with bearer auth, silent refresh-token rotation (single in-flight refresh shared by concurrent
   requests), and typed errors. On unrecoverable 401 it clears the session and emits `firmcrm:unauthorized`. */

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: { loc: string; msg: string; type: string }[];
  constructor(status: number, message: string, code?: string, errors?: ApiError["errors"]) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

const ACCESS_KEY = "firmcrm.access";
const REFRESH_KEY = "firmcrm.refresh";
export const tokenStore = {
  access: () => sessionStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh: string) => { localStorage.setItem(ACCESS_KEY, access); localStorage.setItem(REFRESH_KEY, refresh); },
  clear: () => { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY); sessionStorage.removeItem(ACCESS_KEY); },
};

type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(params?: Query): string {
  if (!params) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

let refreshing: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const rt = tokenStore.refresh();
    if (!rt) return false;
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }) });
      if (!res.ok) return false;
      const j = await res.json();
      tokenStore.set(j.access_token, j.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = res.statusText || `HTTP ${res.status}`;
  let code: string | undefined;
  let errors: ApiError["errors"];
  try {
    const j = await res.json();
    detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    code = j.code;
    errors = j.errors;
  } catch { /* non-JSON body */ }
  return new ApiError(res.status, detail, code, errors);
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; raw?: boolean } = {}, _retried = false): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  const token = tokenStore.access();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = init.body;
  if (init.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.json); }
  const res = await fetch(`/api${path}`, { ...init, headers, body });
  // A 401 from these endpoints is a form/request error (wrong current password, already-revoked token), never session expiry (flows QA #3).
  const authForm = path.startsWith("/auth/login") || path.startsWith("/auth/refresh") || path.startsWith("/auth/change-password") || path.startsWith("/auth/logout");
  if (res.status === 401 && !authForm) {
    if (!_retried && (await tryRefresh())) return api<T>(path, init, true);
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent("firmcrm:unauthorized", { detail: { reason: "expired" } }));
    throw await parseError(res);
  }
  if (res.status === 403) {
    const err = await parseError(res);
    if (err.code === "password_change_required") window.dispatchEvent(new Event("firmcrm:password-change-required"));
    throw err;
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  if (init.raw) return res as unknown as T;
  return (await res.json()) as T;
}

export const get = <T,>(path: string, params?: Query) => api<T>(`${path}${qs(params)}`);
export const post = <T,>(path: string, json?: unknown) => api<T>(path, { method: "POST", json });
export const patch = <T,>(path: string, json?: unknown) => api<T>(path, { method: "PATCH", json });
export const del = <T = void,>(path: string) => api<T>(path, { method: "DELETE" });
export const postForm = <T,>(path: string, form: FormData) => api<T>(path, { method: "POST", body: form });

/** Download an authenticated file (CSV export) as a browser download. */
export async function download(path: string, filename: string): Promise<void> {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

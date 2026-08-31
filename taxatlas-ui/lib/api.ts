/* Typed fetch wrapper for the TaxAtlas API.
 * - CPAAutomation Firebase bearer token (the API also accepts X-API-Key for machine clients).
 * - JSON (de)serialisation, query-string building, normalised `ApiError {status, detail}`.
 * - Exposes the latest rate-limit headers via `rateLimit` for the UI. */

import { getCurrentAuthToken } from '@/lib/firebase'
import type {
  ActivityPoint, ApiKeyCreated, ApiKeyOut, ChangeEventOut, DeliveryAttemptOut, DeliveryChannelCreated, DeliveryChannelIn,
  DeliveryChannelOut, DeliveryChannelPatch, DeliveryTestResult, ChangeHistogram, ChoroplethPoint, CourtDecisionCreate,
  CourtDecisionOut, CourtDecisionPatch, CrawlRunOut, EnumsOut, JurisdictionDetail, JurisdictionOut, JurisdictionPatch,
  JurisdictionSummary, MapMetricsOut, Message, NotificationOut, Page, Quickstart, RateCreate, RatePatch, RegulationCreate,
  RegulationDetail, RegulationOut, RegulationPatch, SourceOut, SourceSchedulesOut, StatsOverview, SubnationalCountry, TariffCreate, TariffOut,
  TariffPatch, TaxRateOut, WatchItemIn, WatchItemOut,
} from "./types";

export const API_BASE = "/api/taxatlas/v1";

export class ApiError extends Error {
  status: number;
  detail: string;
  raw: unknown;
  /** X-Request-ID echoed by the API (present on 5xx once the backend middleware is deployed). */
  requestId: string | null;
  /** Seconds until the rate limit resets (429 only). */
  retryAfter: number | null;
  path: string;
  constructor(status: number, raw: unknown, message?: string, meta?: { requestId?: string | null; retryAfter?: number | null; path?: string }) {
    const detail = formatDetail(raw) ?? `Request failed (${status})`;
    super(message ?? detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.raw = raw;
    this.requestId = meta?.requestId ?? null;
    this.retryAfter = meta?.retryAfter ?? null;
    this.path = meta?.path ?? "";
  }
}

/** Flatten FastAPI error payloads ({detail: string | [{loc,msg}]}) into one readable string. */
export function formatDetail(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((d) => {
        if (d && typeof d === "object" && "msg" in d) {
          const locRaw = (d as { loc?: unknown }).loc;
          const loc = Array.isArray(locRaw) ? locRaw.filter((l) => l !== "body" && l !== "query").join(".") : "";
          const msg = String((d as { msg: unknown }).msg);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return JSON.stringify(d);
      })
      .join("; ");
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("detail" in obj) return formatDetail(obj.detail);
    if (typeof obj.message === "string") return obj.message;
    return JSON.stringify(raw);
  }
  return String(raw);
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function qs(params?: Query): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------- rate-limit headers
export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  resetSeconds: number | null;
  at: number;
}
type RateLimitListener = (info: RateLimitInfo) => void;
const rlListeners = new Set<RateLimitListener>();
export let rateLimit: RateLimitInfo = { limit: null, remaining: null, resetSeconds: null, at: 0 };
export function onRateLimit(fn: RateLimitListener): () => void {
  rlListeners.add(fn);
  return () => rlListeners.delete(fn);
}
function captureRateLimit(res: Response): void {
  const limit = res.headers.get("X-RateLimit-Limit");
  if (!limit) return;
  const num = (v: string | null) => (v == null ? null : Number(v));
  rateLimit = {
    limit: num(limit),
    remaining: num(res.headers.get("X-RateLimit-Remaining")),
    resetSeconds: num(res.headers.get("X-RateLimit-Reset")),
    at: Date.now(),
  };
  rlListeners.forEach((fn) => fn(rateLimit));
}

// ---------------------------------------------------------------- global error hooks
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}
/** Registered by ToastProvider: receives 429 / 5xx / network errors for user-visible notification. */
let apiErrorNotifier: ((err: ApiError) => void) | null = null;
export function setApiErrorNotifier(fn: ((err: ApiError) => void) | null): void {
  apiErrorNotifier = fn;
}

/** Notify the surrounding CPAAutomation shell that its Firebase session expired. */
export function handleSessionExpired(): boolean {
  onUnauthorized?.();
  return false;
}

// ---------------------------------------------------------------- request
interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  anonymous?: boolean;
  /** A 401 from this call means "wrong credentials", not "session expired" (e.g. change-password with a bad
   *  current password): surface it as a normal ApiError instead of signing the user out. */
  credentialCheck?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}${qs(opts.query)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!opts.anonymous) {
    const token = await getCurrentAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? "GET", headers, body, signal: opts.signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    const err = new ApiError(0, (e as Error).message || "Network error", "Network error: API unreachable", { path });
    apiErrorNotifier?.(err);
    throw err;
  }
  captureRateLimit(res);
  if (res.status === 401 && !opts.anonymous && !opts.credentialCheck) {
    const err = new ApiError(401, await safeJson(res), "Your CPAAutomation session expired. Please sign in again.", { path });
    handleSessionExpired();
    throw err;
  }
  if (!res.ok) {
    const retryHeader = res.headers.get("Retry-After") ?? res.headers.get("X-RateLimit-Reset");
    const err = new ApiError(res.status, await safeJson(res), undefined, {
      path,
      requestId: res.headers.get("X-Request-ID"),
      retryAfter: retryHeader != null && Number.isFinite(Number(retryHeader)) ? Number(retryHeader) : null,
    });
    if (res.status === 429 || res.status >= 500) apiErrorNotifier?.(err);
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const http = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>(path, { method: "POST", body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T = Message>(path: string, query?: Query) => request<T>(path, { method: "DELETE", query }),
  anonymousPost: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body, anonymous: true }),
  anonymousGet: <T>(path: string) => request<T>(path, { anonymous: true }),
  /** Authenticated POST whose 401 means the submitted credential was wrong, not that the session expired. */
  credentialPost: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body, credentialCheck: true }),
};

// ---------------------------------------------------------------- typed endpoints
export const api = {
  meta: {
    enums: () => http.get<EnumsOut>("/meta/enums"),
    quickstart: () => http.get<Quickstart>("/meta/quickstart"),
  },
  stats: { overview: () => http.get<StatsOverview>("/stats/overview") },
  jurisdictions: {
    list: (q: Query) => http.get<Page<JurisdictionOut>>("/jurisdictions", q),
    get: (code: string) => http.get<JurisdictionDetail>(`/jurisdictions/${encodeURIComponent(code)}`),
    children: (code: string) => http.get<JurisdictionOut[]>(`/jurisdictions/${encodeURIComponent(code)}/children`),
    rates: (code: string, q?: Query) => http.get<TaxRateOut[]>(`/jurisdictions/${encodeURIComponent(code)}/rates`, q),
    summary: (code: string) => http.get<JurisdictionSummary>(`/jurisdictions/${encodeURIComponent(code)}/summary`),
  },
  map: {
    choropleth: (q: Query) => http.get<ChoroplethPoint[]>("/map/choropleth", q),
    activity: (days = 30) => http.get<ActivityPoint[]>("/map/activity", { days }),
    coverage: (q: Query) => http.get<{ total: number; metrics: Record<string, number> }>("/map/coverage", q),
    /** Countries with sub-national rate data and the metrics available per country (drives the drill-down). */
    subnational: () => http.get<SubnationalCountry[]>("/map/subnational"),
    /** Data-driven metric list: every (tax_type, rate_kind) pair with coverage at a level (rail groups). */
    metrics: (q: Query) => http.get<MapMetricsOut>("/map/metrics", q),
  },
  rates: { list: (q: Query) => http.get<Page<TaxRateOut>>("/rates", q) },
  regulations: {
    list: (q: Query) => http.get<Page<RegulationOut>>("/regulations", q),
    get: (id: number) => http.get<RegulationDetail>(`/regulations/${id}`),
  },
  courtDecisions: {
    list: (q: Query) => http.get<Page<CourtDecisionOut>>("/court-decisions", q),
    get: (id: number) => http.get<CourtDecisionOut>(`/court-decisions/${id}`),
  },
  tariffs: {
    list: (q: Query) => http.get<Page<TariffOut>>("/tariffs", q),
    get: (id: number) => http.get<TariffOut>(`/tariffs/${id}`),
  },
  changes: {
    list: (q: Query) => http.get<Page<ChangeEventOut>>("/changes", q),
    /** Server-side per-day aggregate (zero-filled, oldest→newest); accepts the same scope filters as the list. */
    histogram: (q: Query) => http.get<ChangeHistogram>("/changes/histogram", q),
  },
  /** Admin maintenance. Every write emits a ChangeEvent; 403 for non-admins. */
  admin: {
    createRate: (body: RateCreate) => http.post<TaxRateOut>("/admin/rates", body),
    patchRate: (id: number, body: RatePatch) => http.patch<TaxRateOut>(`/admin/rates/${id}`, body),
    deleteRate: (id: number, reason?: string) => http.delete(`/admin/rates/${id}`, { reason }),
    createRegulation: (body: RegulationCreate) => http.post<RegulationDetail>("/admin/regulations", body),
    patchRegulation: (id: number, body: RegulationPatch) => http.patch<RegulationDetail>(`/admin/regulations/${id}`, body),
    deleteRegulation: (id: number, reason?: string) => http.delete(`/admin/regulations/${id}`, { reason }),
    createDecision: (body: CourtDecisionCreate) => http.post<CourtDecisionOut>("/admin/court-decisions", body),
    patchDecision: (id: number, body: CourtDecisionPatch) => http.patch<CourtDecisionOut>(`/admin/court-decisions/${id}`, body),
    deleteDecision: (id: number, reason?: string) => http.delete(`/admin/court-decisions/${id}`, { reason }),
    createTariff: (body: TariffCreate) => http.post<TariffOut>("/admin/tariffs", body),
    patchTariff: (id: number, body: TariffPatch) => http.patch<TariffOut>(`/admin/tariffs/${id}`, body),
    deleteTariff: (id: number, reason?: string) => http.delete(`/admin/tariffs/${id}`, { reason }),
    patchJurisdiction: (code: string, body: JurisdictionPatch) => http.patch<JurisdictionDetail>(`/admin/jurisdictions/${encodeURIComponent(code)}`, body),
  },
  sources: {
    schedules: () => http.get<SourceSchedulesOut>("/sources/schedules"),
    list: (q?: Query) => http.get<SourceOut[]>("/sources", q),
    runs: (q?: Query) => http.get<Page<CrawlRunOut>>("/sources/runs", q),
    crawl: (id: number) => http.post<Message>(`/sources/${id}/crawl`),
    crawlAll: () => http.post<Message>("/sources/crawl-all"),
    toggle: (id: number) => http.patch<SourceOut>(`/sources/${id}/toggle`),
  },
  account: {
    keys: () => http.get<ApiKeyOut[]>("/account/api-keys"),
    createKey: (name: string, scopes?: string[]) => http.post<ApiKeyCreated>("/account/api-keys", scopes ? { name, scopes } : { name }),
    revokeKey: (id: number) => http.delete(`/account/api-keys/${id}`),
    watchlist: () => http.get<WatchItemOut[]>("/account/watchlist"),
    addWatch: (body: WatchItemIn) => http.post<WatchItemOut>("/account/watchlist", body),
    removeWatch: (id: number) => http.delete(`/account/watchlist/${id}`),
    notifications: (unreadOnly = false) => http.get<NotificationOut[]>("/account/notifications", { unread_only: unreadOnly }),
    readAll: () => http.post<Message>("/account/notifications/read-all"),
    readOne: (id: number) => http.post<Message>(`/account/notifications/${id}/read`),
  },
  /** Delivery channels: session (JWT) only; API keys get 403. */
  delivery: {
    list: () => http.get<DeliveryChannelOut[]>("/account/delivery"),
    create: (body: DeliveryChannelIn) => http.post<DeliveryChannelCreated>("/account/delivery", body),
    patch: (id: number, body: DeliveryChannelPatch) => http.patch<DeliveryChannelOut>(`/account/delivery/${id}`, body),
    remove: (id: number) => http.delete(`/account/delivery/${id}`),
    test: (id: number) => http.post<DeliveryTestResult>(`/account/delivery/${id}/test`),
    attempts: (id: number) => http.get<DeliveryAttemptOut[]>(`/account/delivery/${id}/attempts`),
  },
};

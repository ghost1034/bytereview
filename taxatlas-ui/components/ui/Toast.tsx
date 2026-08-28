import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, setApiErrorNotifier } from "@/taxatlas-ui/lib/api";

export type ToastKind = "success" | "error" | "info" | "attention";
export interface ToastAction {
  label: string;
  href: string;
}
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  action?: ToastAction;
}

interface ToastCtx {
  success: (title: string, detail?: string, action?: ToastAction) => void;
  error: (err: unknown, ...rest: unknown[]) => void;
  info: (title: string, detail?: string) => void;
  attention: (title: string, detail?: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return String(err);
}

const MAX_STACK = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = idRef.current++;
      setToasts((ts) => [...ts.slice(-(MAX_STACK - 1)), { ...t, id }]);
      // Errors persist until dismissed; everything else auto-dismisses after 4 s.
      if (t.kind !== "error") window.setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );
  // Global API failures (429 / 5xx / network) surface here once per path+status per 5 s,
  // so react-query retries do not stack duplicate toasts.
  const recent = useRef(new Map<string, number>());
  useEffect(() => {
    setApiErrorNotifier((err) => {
      const key = `${err.status}:${err.path}`;
      const now = Date.now();
      const last = recent.current.get(key) ?? 0;
      if (now - last < 5000) return;
      recent.current.set(key, now);
      if (err.status === 429) {
        push({ kind: "attention", title: "Rate limit reached", detail: err.retryAfter != null ? `Resets in ${err.retryAfter} s.` : err.detail });
      } else if (err.status >= 500) {
        push({ kind: "error", title: `Server error (${err.status})`, detail: `${err.detail}${err.requestId ? ` · request ${err.requestId}` : ""}` });
      } else if (err.status === 0) {
        push({ kind: "error", title: "API unreachable", detail: err.detail });
      }
    });
    return () => setApiErrorNotifier(null);
  }, [push]);

  const value = useMemo<ToastCtx>(
    () => ({
      success: (title, detail, action) => push({ kind: "success", title, detail, action }),
      info: (title, detail) => push({ kind: "info", title, detail }),
      attention: (title, detail) => push({ kind: "attention", title, detail }),
      error: (err, ...rest) => {
        const title = typeof rest[0] === "string" ? rest[0] : undefined;
        const status = err instanceof ApiError ? err.status : undefined;
        push({ kind: "error", title: title ?? (status ? `Request failed (${status})` : "Something went wrong"), detail: errorMessage(err) });
      },
    }),
    [push],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="toasts">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="toast" data-kind={t.kind}>
            <div className="min-w-0 flex-1">
              <div>{t.title}</div>
              {t.detail && <div className="detail">{t.detail}</div>}
              {t.action && (
                <a href={t.action.href} className="mt-1 inline-block text-xs" onClick={() => dismiss(t.id)}>
                  {t.action.label} →
                </a>
              )}
            </div>
            <button type="button" aria-label="Close notification" onClick={() => dismiss(t.id)} className="grid h-5 w-5 shrink-0 place-items-center rounded-xs text-ink-3 hover:bg-surface-3 hover:text-ink-1">
              <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 stroke-current" fill="none" strokeWidth="1.75" aria-hidden="true">
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

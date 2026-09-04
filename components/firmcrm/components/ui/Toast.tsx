import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string };
interface Ctx { toast: (message: string, kind?: Toast["kind"]) => void; error: (e: unknown) => void }
const ToastCtx = createContext<Ctx | null>(null);

const ICON = {
  success: <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-crm-success-200" />,
  error: <AlertCircle size={16} className="mt-0.5 shrink-0 text-crm-danger-200" />,
  info: <Info size={16} className="mt-0.5 shrink-0 text-crm-accent-200" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = useCallback((message: string, kind: Toast["kind"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === "error" ? 8000 : 4000);
  }, []);
  const error = useCallback((e: unknown) => toast(e instanceof Error ? e.message : String(e), "error"), [toast]);
  const value = useMemo(() => ({ toast, error }), [toast, error]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-6 right-6 z-crm-toast flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role="status" className="fade-in flex w-[360px] items-start gap-2.5 rounded-crm-xl bg-crm-sand-900 px-3.5 py-3 text-[13px] leading-5 text-white shadow-crm-toast">
            {ICON[t.kind]}
            <span className="flex-1 break-words">{t.message}</span>
            <button type="button" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="grid h-5 w-5 shrink-0 place-items-center rounded text-crm-sand-400 hover:text-white"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToast outside provider");
  return c;
}

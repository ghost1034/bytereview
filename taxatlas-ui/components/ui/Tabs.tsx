import type { ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";
import { CountPill } from "./Marker";

export interface TabDef<K extends string> {
  key: K;
  label: ReactNode;
  count?: number;
}

/** Text tabs, 36 px, brass underline on the selected tab; counts render as the single permitted pill.
 *  Arrow keys move selection; the active key is expected to live in the URL (`?tab=`). */
export function Tabs<K extends string>({ tabs, value, onChange, className, ariaLabel }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void; className?: string; ariaLabel?: string }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("tabs", className)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = tabs.findIndex((t) => t.key === value);
        const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        if (n) {
          onChange(n.key);
          (e.currentTarget.querySelector(`[data-key="${n.key}"]`) as HTMLElement | null)?.focus();
        }
      }}
    >
      {tabs.map((t) => {
        const selected = t.key === value;
        return (
          <button key={t.key} type="button" role="tab" data-key={t.key} aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => onChange(t.key)}>
            {t.label}
            {t.count !== undefined && <CountPill>{t.count}</CountPill>}
          </button>
        );
      })}
    </div>
  );
}

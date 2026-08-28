/* @deprecated — KPI tiles are replaced by the hairline `StatStrip` (components/ui/StatStrip).
 * Kept so existing callers compile; `KpiTile` now renders a strip-style cell (caps label, mono value). */
import type { ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";

/** @deprecated Use `<StatStrip><Stat … /></StatStrip>`. */
export function KpiTile({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("panel px-3.5 py-2.5", className)}>
      <div className="label-caps truncate">{label}</div>
      <div className="num mt-1 flex items-baseline gap-2 text-xl text-ink-1">
        {value}
        {hint && <span className="font-sans text-xs text-ink-3">{hint}</span>}
      </div>
    </div>
  );
}

/** Compact inline stat (label + mono value) for toolbars and map overlays. */
export function KpiInline({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="label-caps">{label}</span>
      <span className="num text-ink-1">{value}</span>
    </div>
  );
}

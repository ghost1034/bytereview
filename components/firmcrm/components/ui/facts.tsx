/* Key-facts grid (DESIGN.md §6.4) and the shared not-found card for detail pages. */
import type { ReactNode } from "react";
import { Link } from "@/components/firmcrm/lib/navigation";
import { cn } from "./index";
import { Dash } from "./cells";

export type Fact = { label: string; value: ReactNode; sub?: ReactNode; size?: "kpi" | "text" };
/**
 * Key-facts grid (§6.4). Cells auto-fit at ≥180px and wrap to a second row when narrow, so values never clip.
 * `size: "kpi"` (default, money) is 24px nowrap and steps down to 20px below 1280; `size: "text"` is 20px and wraps.
 * Cell rules are drawn per cell (right + bottom) and the outer edge is clipped by the card, so wrapped rows stay ruled.
 */
export function FactsGrid({ facts, className }: { facts: Fact[]; className?: string }) {
  return (
    <div className={cn("card mb-6 overflow-hidden", className)}>
      <div className={cn("-mr-px -mb-px grid", facts.length === 6 && "grid-cols-2 md:grid-cols-3 xl:grid-cols-6")} style={facts.length === 6 ? undefined : { gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {facts.map((f) => (
          <div key={f.label} className="min-w-0 border-r border-b border-crm-sand-100 px-5 py-3.5" title={typeof f.value === "string" ? f.value : undefined}>
            <div className="text-[12px] leading-4 font-medium text-crm-sand-600">{f.label}</div>
            <div className={cn("mt-1 font-semibold text-crm-sand-900 num", f.size === "text" ? "break-words text-[20px] leading-7 tracking-[-0.015em]" : "whitespace-nowrap text-[24px] leading-7 tracking-[-0.02em] max-[1279px]:text-[20px]")}>{f.value ?? <Dash />}</div>
            {f.sub != null && <div className="mt-0.5 break-words text-[12px] leading-4 text-crm-sand-500">{f.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Not-found card shared by the detail pages (wall-restricted or deleted record). */
export function NotFound({ what, backTo, backLabel, hint = "It may have been removed, or access is restricted by an ethical wall." }: { what: string; backTo: string; backLabel: string; hint?: string }) {
  return (
    <div className="card max-w-[480px] p-6">
      <div className="text-[15px] leading-[22px] font-semibold tracking-[-0.01em]">{what} not found</div>
      <div className="mt-1 text-[12px] leading-4 text-crm-sand-500">{hint}</div>
      <Link to={backTo} className="mt-3 inline-block text-[13px]">← {backLabel}</Link>
    </div>
  );
}


/* Stat strip from a cells array — adapter over ui/StatStrip (one hairline row, no KPI tiles). */
import type { ReactNode } from "react";
import { Stat, StatStrip as UiStatStrip } from "@/taxatlas-ui/components/ui/StatStrip";
import { fmtInt } from "@/taxatlas-ui/lib/format";

export interface StatCell {
  label: string;
  value: number | string | null | undefined;
  qualifier?: ReactNode;
  spark?: ReactNode;
  href?: string;
}

export function StatStrip({ cells, small, className, label }: { cells: StatCell[]; small?: boolean; className?: string; label?: string }) {
  return (
    <UiStatStrip size={small ? "sm" : "md"} bare={!small} className={className} ariaLabel={label ?? "Summary figures"}>
      {cells.map((c) => (
        <Stat key={c.label} label={c.label} value={typeof c.value === "number" ? fmtInt(c.value) : c.value ?? "—"} qualifier={c.qualifier} spark={c.spark} to={c.href} />
      ))}
    </UiStatStrip>
  );
}

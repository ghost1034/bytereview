import type { ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Required when `label` is icon-only. */
  title?: string;
}

/** Segmented control (26 px). Uses aria-pressed per option; `ariaLabel` names the group. */
export function Segmented<V extends string>({ options, value, onChange, ariaLabel, className }: { options: SegmentOption<V>[]; value: V; onChange: (v: V) => void; ariaLabel: string; className?: string }) {
  return (
    <div className={cn("seg", className)} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} title={o.title} aria-label={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

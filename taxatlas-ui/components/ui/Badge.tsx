/* @deprecated — coloured pill badges are removed from the design system.
 * These wrappers keep old imports compiling: `Badge` renders plain ink-2 text (no pill),
 * `StatusBadge` renders the shape-coded `StatusMark`. Migrate to components/ui/Marker. */
import type { ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";
import { StatusMark } from "./Marker";

type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "violet" | "slate";

/** @deprecated Use plain text, `StatusMark`, `SignificanceMark` or `CountPill` from ./Marker. */
export function Badge({ children, className, mono, title }: { tone?: Tone; children: ReactNode; className?: string; mono?: boolean; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center whitespace-nowrap text-sm text-ink-2", mono && "mono", className)}>
      {children}
    </span>
  );
}

/** @deprecated Use `StatusMark` from ./Marker. */
export function StatusBadge({ value, label }: { value: string | null | undefined; label?: string }) {
  return <StatusMark value={value} label={label} />;
}

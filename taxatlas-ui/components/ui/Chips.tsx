/* Entity references used inside table cells and drawers.
 * `JurisdictionChip`/`TaxTypeChip` are kept as @deprecated names; they no longer render boxes. */
import type { ReactNode } from "react";
import type { JurisdictionRef as JurisdictionRefType } from "@/taxatlas-ui/lib/types";
import { TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import { cn } from "@/taxatlas-ui/lib/utils";
import { JurisdictionRef } from "./JurisdictionRef";

/** @deprecated Use `JurisdictionRef` from ./JurisdictionRef. Renders the same `jref` markup. */
export function JurisdictionChip({ j, code }: { j?: JurisdictionRefType | null; code?: string | null }) {
  return <JurisdictionRef j={j} code={code} />;
}

/** Tax type as plain ink-2 text (never a chip). */
export function TaxTypeText({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-ink-3">—</span>;
  return <span className={cn("whitespace-nowrap text-sm text-ink-2", className)}>{label(TAX_TYPE_LABEL, value)}</span>;
}

/** @deprecated Use `TaxTypeText`. */
export const TaxTypeChip = TaxTypeText;

/** External source link: host name + typographic ↗. Stops row-click propagation. */
export function SourceLink({ href, children = "Source", className }: { href: string | null | undefined; children?: ReactNode; className?: string }) {
  if (!href) return <span className="text-ink-3">—</span>;
  let host = "";
  try {
    host = new URL(href).host.replace(/^www\./, "");
  } catch {
    host = href;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={cn("whitespace-nowrap text-xs", className)} title={href}>
      {children === "Source" ? host : children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

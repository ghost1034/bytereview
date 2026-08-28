import { Link } from "@/taxatlas-ui/lib/navigation";
import type { JurisdictionRef as JurisdictionRefType } from "@/taxatlas-ui/lib/types";
import { cn } from "@/taxatlas-ui/lib/utils";

/** Jurisdiction reference: mono code + name, baseline-aligned, no box. Links to the detail page.
 *  Import alongside the type as `import { JurisdictionRef as JRef }` if names clash. */
export function JurisdictionRef({
  j,
  code,
  name,
  nameless,
  className,
  stopPropagation = true,
}: {
  j?: JurisdictionRefType | null;
  code?: string | null;
  name?: string | null;
  /** Show only the code (for tight columns). */
  nameless?: boolean;
  className?: string;
  stopPropagation?: boolean;
}) {
  const c = j?.code ?? code;
  const n = j?.name ?? name;
  if (!c) return <span className="text-ink-3">Global</span>;
  return (
    <Link to={`/jurisdictions/${c}`} className={cn("jref", className)} title={n ?? c} onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}>
      <span className="code">{c}</span>
      {!nameless && n && <span className="name truncate">{n}</span>}
    </Link>
  );
}

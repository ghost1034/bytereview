/* Jurisdiction reference (adapter over ui/JurisdictionRef) and an external source link with a typographic ↗. */
import type { JurisdictionRef } from "@/taxatlas-ui/lib/types";
import { JurisdictionRef as UiJurisdictionRef } from "@/taxatlas-ui/components/ui/JurisdictionRef";
import "./lists.css";

export function JRef({ j, code, nameless }: { j?: JurisdictionRef | null; code?: string | null; nameless?: boolean }) {
  return <UiJurisdictionRef j={j} code={code} nameless={nameless} />;
}

/** External link rendered as host (or custom text) with a typographic ↗; `full` adds the path. */
export function SourceLink({ href, children, full }: { href: string | null | undefined; children?: React.ReactNode; full?: boolean }) {
  if (!href) return <span className="ta-faint">—</span>;
  let host = href;
  try {
    const u = new URL(href);
    host = full ? `${u.host.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}` : u.host.replace(/^www\./, "");
  } catch {
    host = href;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="ta-src" title={href}>
      {children ?? host} ↗
    </a>
  );
}

import type { ReactNode } from "react";
import { Link } from "@/taxatlas-ui/lib/navigation";
import { cn } from "@/taxatlas-ui/lib/utils";

/** Non-map page container: max 1560 px, 20 px side padding, 14 px vertical rhythm. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("page-inner", className)}>{children}</div>;
}

export interface Crumb {
  label: ReactNode;
  to?: string;
}

/** One h1 per page (16 px / 500). `crumbs` renders a breadcrumb line above. */
export function PageHeader({ title, subtitle, actions, crumbs, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: Crumb[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {crumbs && crumbs.length > 0 && (
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} className="contents">
              {i > 0 && (
                <span className="sep" aria-hidden="true">
                  /
                </span>
              )}
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="page-head">
        <div className="min-w-0">
          <h1>{title}</h1>
          {subtitle && <div className="sub">{subtitle}</div>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  );
}

/** @deprecated Transitional labelled-controls toolbar. Prefer `ChipBar` + `FilterChip` from components/ui/FilterChips.
 *  Kept so list pages keep compiling; renders as a flat toolbar row (no panel) with a text "Reset (n)" button. */
export function FilterBar({ children, onReset, active, className }: { children: ReactNode; onReset?: () => void; active?: number; className?: string }) {
  return (
    <div className={cn("toolbar items-end gap-2.5", className)} role="group" aria-label="Filters">
      {children}
      {onReset && (
        <button type="button" onClick={onReset} disabled={!active} className="ml-auto h-7 self-end text-xs text-ink-3 hover:text-ink-1 disabled:opacity-40">
          Reset{active ? ` (${active})` : ""}
        </button>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "@/taxatlas-ui/lib/navigation";
import { cn } from "@/taxatlas-ui/lib/utils";

/** One hairline-bordered row of stats (replaces KPI tile grids).
 *  `size="sm"` is the in-drawer variant (14 px values). `wrap` lets cells flow onto a second row. `bare` drops the
 *  outer border (for use directly under a page header, separated by a bottom hairline). */
export function StatStrip({ children, className, size = "md", wrap, bare, ariaLabel }: { children: ReactNode; className?: string; size?: "md" | "sm"; wrap?: boolean; bare?: boolean; ariaLabel?: string }) {
  return (
    <div className={cn("statstrip", size === "sm" && "sm", wrap && "wrap", bare && "bare", className)} role="group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

/** A strip cell. `value` is mono; `qualifier` is sans ink-3 after the value; `spark` right-aligns a Sparkline. */
export function Stat({ label, value, qualifier, spark, to, title, className }: { label: ReactNode; value: ReactNode; qualifier?: ReactNode; spark?: ReactNode; to?: string; title?: string; className?: string }) {
  const body = (
    <>
      <div className="k">{label}</div>
      <div className="v">
        <span className="val">{value ?? "—"}</span>
        {qualifier && <small>{qualifier}</small>}
        {spark}
      </div>
    </>
  );
  if (to)
    return (
      <Link to={to} className={cn("stat", className)} title={title}>
        {body}
      </Link>
    );
  return (
    <div className={cn("stat", className)} title={title}>
      {body}
    </div>
  );
}

/** Static SVG sparkline: 1.25 px brass line over an accent-soft area, no axes. `title` carries min/max/last. */
export function Sparkline({ values, width = 72, height = 20, className, title }: { values: number[]; width?: number; height?: number; className?: string; title?: string }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const y = (v: number) => height - 1 - (v / max) * (height - 2);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)} ${y(v).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} V${height} H0 Z`;
  const last = values[values.length - 1];
  return (
    <svg className={cn("spark", className)} viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none" role="img" aria-label={title ?? `min ${min}, max ${max}, last ${last}`}>
      <title>{title ?? `min ${min} · max ${max} · last ${last}`}</title>
      <path className="area" d={area} />
      <path d={line} />
    </svg>
  );
}

import { useEffect } from "react";
import { fmtInt } from "@/taxatlas-ui/lib/format";
import { Select } from "./Fields";

const LIMITS = [25, 50, 100, 200];

/** Table footer pagination: mono range "1–50 of 699", optional rows-per-page, ‹ page numbers ›.
 *  Keyboard: `[` previous page, `]` next page (ignored while typing in a field). */
export function Pagination({
  total,
  limit,
  offset,
  onChange,
  onLimitChange,
  limits = LIMITS,
  children,
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  onLimitChange?: (limit: number) => void;
  limits?: number[];
  /** Extra footer content (e.g. "Sorted by …") rendered left of the pager. */
  children?: React.ReactNode;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + limit);
  const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  const page = Math.floor(offset / Math.max(1, limit)) + 1;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "[" && hasPrev) onChange(Math.max(0, offset - limit));
      if (e.key === "]" && hasNext) onChange(offset + limit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, offset, limit, onChange]);

  return (
    <div className="tbl-foot">
      <span className="num text-ink-2">
        {fmtInt(from)}–{fmtInt(to)} of {fmtInt(total)}
      </span>
      {onLimitChange && (
        <label className="flex items-center gap-1.5">
          Rows
          <Select className="h-6 w-[64px] py-0 text-xs" aria-label="Rows per page" value={String(limit)} onChange={(e) => onLimitChange(Number(e.target.value))} options={limits.map((l) => ({ value: String(l), label: String(l) }))} />
        </label>
      )}
      {children}
      <nav className="pages" aria-label="Pagination">
        <button type="button" aria-label="Previous page" disabled={!hasPrev} onClick={() => onChange(Math.max(0, offset - limit))}>
          ‹
        </button>
        {pageWindow(page, pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-ink-4" aria-hidden="true">
              …
            </span>
          ) : (
            <button key={p} type="button" aria-current={p === page ? "page" : undefined} aria-label={p === page ? undefined : `Page ${p}`} onClick={() => onChange((p - 1) * limit)}>
              {p}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" disabled={!hasNext} onClick={() => onChange(offset + limit)}>
          ›
        </button>
      </nav>
    </div>
  );
}

/** first, last, current ±1, with ellipses. */
function pageWindow(page: number, pages: number): Array<number | null> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = Array.from(set).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

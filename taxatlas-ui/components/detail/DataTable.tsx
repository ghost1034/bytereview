/* Table shell (components.md §3, §8): region with toolbar (sort label, density toggle, column chooser),
   sticky-header table, footer with range / rows-per-page / page numbers. Rows are rendered by the page
   so each table keeps its own column semantics. Built locally for WP-C; WP-A may absorb as ui/DataTable. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtInt } from "@/taxatlas-ui/lib/format";
import "./lists.css";

export type Density = "dense" | "normal";
export interface ColumnDef {
  key: string;
  label: string;
  /** Default-hidden columns (components.md: Tags, First seen, Last seen). */
  hidden?: boolean;
  /** Cannot be hidden (primary column). */
  fixed?: boolean;
  num?: boolean;
  width?: number;
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Density + hidden columns, persisted per table id. */
export function useTableSettings(id: string, columns: ColumnDef[]) {
  const [density, setDensity] = useState<Density>(() => readLS<Density>("ta.density", "dense"));
  const [hidden, setHidden] = useState<string[]>(() => readLS<string[]>(`ta.cols.${id}`, columns.filter((c) => c.hidden).map((c) => c.key)));
  useEffect(() => localStorage.setItem("ta.density", JSON.stringify(density)), [density]);
  useEffect(() => localStorage.setItem(`ta.cols.${id}`, JSON.stringify(hidden)), [hidden, id]);
  const visible = useMemo(() => columns.filter((c) => !hidden.includes(c.key)), [columns, hidden]);
  const show = useCallback((key: string) => !hidden.includes(key), [hidden]);
  const toggle = (key: string) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));
  return { density, setDensity, hidden, toggle, visible, show, columns };
}

export function TableRegion({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `ta-region ${className}` : "ta-region"}>{children}</div>;
}

export function Toolbar({ sortLabel, settings, left, right }: { sortLabel?: ReactNode; settings?: ReturnType<typeof useTableSettings>; left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="ta-toolbar">
      {sortLabel && <span className="result">Sorted by {sortLabel}</span>}
      {left}
      <span className="spacer" />
      {right}
      {settings && <DensityToggle value={settings.density} onChange={settings.setDensity} />}
      {settings && <ColumnsMenu settings={settings} />}
    </div>
  );
}

export function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <div className="ta-seg" role="group" aria-label="Density">
      <button type="button" aria-pressed={value === "dense"} title="Compact rows" aria-label="Compact rows" onClick={() => onChange("dense")}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" /></svg>
      </button>
      <button type="button" aria-pressed={value === "normal"} title="Comfortable rows" aria-label="Comfortable rows" onClick={() => onChange("normal")}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12M2 8h12M2 13h12" /></svg>
      </button>
    </div>
  );
}

export function ColumnsMenu({ settings }: { settings: ReturnType<typeof useTableSettings> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const total = settings.columns.length;
  const shown = settings.visible.length;
  return (
    <div className="ta-pop-anchor" ref={ref}>
      <button type="button" className="btn btn-ghost btn-sm" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Columns <span className="mono ta-faint" style={{ fontSize: "var(--text-2xs)" }}>{shown}/{total}</span>
      </button>
      {open && (
        <div className="ta-pop" role="group" aria-label="Columns">
          <div className="ta-caps">Columns</div>
          {settings.columns.map((c) => (
            <label key={c.key}>
              <input type="checkbox" checked={settings.show(c.key)} disabled={c.fixed} onChange={() => settings.toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SortIcon({ dir }: { dir: "desc" | "asc" }) {
  return (
    <svg className="sort" viewBox="0 0 8 8" aria-hidden="true" data-dir={dir}>
      <path d="M1 3l3 3 3-3" />
    </svg>
  );
}

/** Header cell. `sort` marks the active sort (aria-sort); `onSort` makes it clickable. */
export function Th({ children, num, width, sort, onSort, className, hidden }: { children: ReactNode; num?: boolean; width?: number; sort?: "desc" | "asc" | null; onSort?: () => void; className?: string; hidden?: boolean }) {
  if (hidden) return null;
  const cls = [num ? "num" : "", className ?? ""].filter(Boolean).join(" ") || undefined;
  const ariaSort = sort === "desc" ? "descending" : sort === "asc" ? "ascending" : undefined;
  return (
    <th className={cls} style={width ? { width } : undefined} aria-sort={ariaSort} scope="col">
      {onSort ? (
        <button type="button" className="sortable" onClick={onSort}>
          {children}
          <SortIcon dir={sort ?? "desc"} />
        </button>
      ) : (
        <>
          {children}
          {sort && <SortIcon dir={sort} />}
        </>
      )}
    </th>
  );
}

export function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  const widths = ["60%", "35%", "80%", "45%", "55%", "40%", "70%", "30%"];
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}>
              <span className="ta-sk" style={{ width: widths[(r + c) % widths.length] }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function MessageRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr className="msg">
      <td colSpan={cols}>{children}</td>
    </tr>
  );
}

export function ErrorRow({ cols, error, noun, onRetry }: { cols: number; error: unknown; noun: string; onRetry: () => void }) {
  const status = (error as { status?: number })?.status;
  return (
    <MessageRow cols={cols}>
      Could not load {noun}{status ? <> (<span className="code">HTTP {status}</span>)</> : null}.
      <button type="button" className="btn btn-sm" onClick={onRetry}>Retry</button>
    </MessageRow>
  );
}

/** Compact pagination with page numbers: `1–50 of 699 · Rows 50 ▾ … ‹ 1 2 3 … 14 ›`. */
export function TableFoot({ total, limit, offset, onOffset, onLimit, rowsOptions = [25, 50, 100, 200], children }: { total: number; limit: number; offset: number; onOffset: (o: number) => void; onLimit?: (l: number) => void; rowsOptions?: number[]; children?: ReactNode }) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + limit);
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  const items = pageItems(page, pages);
  const go = (p: number) => onOffset((p - 1) * limit);
  return (
    <div className="tbl-foot">
      <span className="ta-range">
        <b>{fmtInt(from)}–{fmtInt(to)}</b> of <b>{fmtInt(total)}</b>
      </span>
      {onLimit && (
        <span className="ta-rows">
          Rows <b>{limit}</b> ▾
          <select aria-label="Rows per page" value={String(limit)} onChange={(e) => onLimit(Number(e.target.value))}>
            {rowsOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </span>
      )}
      {children}
      <div className="pages">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}>‹</button>
        {items.map((it, i) =>
          it === "…" ? (
            <span key={`gap${i}`} className="gap">…</span>
          ) : (
            <button key={it} type="button" aria-current={it === page ? "page" : undefined} aria-label={`Page ${it}`} onClick={() => go(it)}>
              {it}
            </button>
          ),
        )}
        <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => go(page + 1)}>›</button>
      </div>
    </div>
  );
}

function pageItems(page: number, pages: number): Array<number | "…"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((p) => set.add(p));
  const sorted = Array.from(set).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/** Deep links and stale bookmarks can carry an offset past the last page (`?offset=99999`), which renders a
 *  "100,000–599 of 599" range over an empty table. Snap to the last page once the total is known. */
export function useClampOffset(total: number | undefined, offset: number, limit: number, onOffset: (o: number) => void) {
  useEffect(() => {
    if (total == null || total === 0 || offset < total) return;
    onOffset(Math.floor((total - 1) / limit) * limit);
  }, [total, offset, limit, onOffset]);
}

/** Keyboard: j/k or arrows move the selection, Enter opens, Escape closes, [ ] page. Skips when typing in a field. */
export function useListKeys({ ids, selected, onSelect, onOpen, onClose, onPrevPage, onNextPage, enabled = true }: { ids: number[]; selected: number | null; onSelect: (id: number) => void; onOpen?: (id: number) => void; onClose?: () => void; onPrevPage?: () => void; onNextPage?: () => void; enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = selected == null ? -1 : ids.indexOf(selected);
      if (e.key === "ArrowDown" || e.key === "j") {
        if (ids.length === 0) return;
        e.preventDefault();
        onSelect(ids[Math.min(ids.length - 1, idx + 1)]);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        if (ids.length === 0) return;
        e.preventDefault();
        onSelect(ids[Math.max(0, idx <= 0 ? 0 : idx - 1)]);
      } else if (e.key === "Enter" && selected != null && onOpen) {
        onOpen(selected);
      } else if (e.key === "Escape" && onClose) {
        onClose();
      } else if (e.key === "[" && onPrevPage) {
        onPrevPage();
      } else if (e.key === "]" && onNextPage) {
        onNextPage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ids, selected, onSelect, onOpen, onClose, onPrevPage, onNextPage, enabled]);
}

/** Client-side CSV of the rows on screen (server CSV export for lists is an API need; see report). */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

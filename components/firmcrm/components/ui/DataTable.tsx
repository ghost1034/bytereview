import { type ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Empty, cn } from "./index";

export interface Column<T> {
  key: string; header: ReactNode; render: (row: T) => ReactNode; sort?: (row: T) => string | number | null | undefined; align?: "left" | "right"; width?: string; nowrap?: boolean; maxWidth?: string;
  /** Hide this column (th + td) below the given viewport width so secondary columns yield to the primary ones at 1180–1279. */
  hideBelow?: 1280 | 1180;
}
const HIDE: Record<1280 | 1180, string> = { 1280: "max-[1281px]:hidden", 1180: "max-[1181px]:hidden" }; // Tailwind v4 `max-[N]` = width < N, so N+1 hides at ≤ N inclusive
const hideCls = <T,>(c: Column<T>) => (c.hideBelow ? HIDE[c.hideBelow] : undefined);

function SkeletonRows<T>({ columns, twoLine }: { columns: Column<T>[]; twoLine?: boolean }) {
  const widths = ["w-3/5", "w-2/5", "w-[30%]", "w-1/2", "w-2/5", "w-[30%]"];
  return (
    <tbody>
      {widths.map((w, r) => (
        <tr key={r} className={twoLine ? "row-2line" : undefined}>{columns.map((c, i) => <td key={c.key} className={hideCls(c)}><span className={cn("skeleton", widths[(r + i) % widths.length], w)} /></td>)}</tr>
      ))}
    </tbody>
  );
}

/**
 * `twoLine`: rows carry a 12px secondary line (NameCell sub) — rows grow to 52px (§6.6).
 * Clickable rows are keyboard-reachable (Tab, Enter/Space) and show the §6.6 inset focus ring.
 */
export type SortState = { key: string; dir: "asc" | "desc" };

/**
 * Server-side sort state for a paged list. `map` translates column keys to API `sort` fields (unmapped columns must not carry a
 * `sort` accessor). `onChange` runs on every change — pass the pager reset so page 1 is shown in the new order.
 */
export function useServerSort(initial: SortState, map: Record<string, string>, onChange?: () => void) {
  const [sort, setSort] = useState<SortState>(initial);
  const onSortChange = (key: string, dir: "asc" | "desc") => { setSort({ key, dir }); onChange?.(); };
  return { sort, onSortChange, params: { sort: map[sort.key], dir: sort.dir } as { sort: string | undefined; dir: "asc" | "desc" } };
}

/**
 * Sorting is client-side by default (`initialSort`, columns with a `sort` accessor). For paged lists pass `sort` + `onSortChange`:
 * the table then only reflects/reports the order and the API sorts the whole result set (flows QA #10). A column is sortable when it
 * has a `sort` accessor; in controlled mode the accessor is ignored and only marks the column as server-sortable.
 */
export function DataTable<T extends { id: number | string }>({ rows, columns, loading, onRowClick, empty, initialSort, sort: controlled, onSortChange, footer, twoLine, layout = "auto" }: {
  rows: T[] | undefined; columns: Column<T>[]; loading?: boolean; onRowClick?: (r: T) => void;
  /** Empty-state title (string) or a full custom node (e.g. `<Empty title hint action />`). */
  empty?: ReactNode; initialSort?: SortState; sort?: SortState | null; onSortChange?: (key: string, dir: "asc" | "desc") => void; footer?: ReactNode; twoLine?: boolean; layout?: "auto" | "fixed";
}) {
  const [local, setLocal] = useState<SortState | null>(initialSort ?? null);
  const isControlled = onSortChange !== undefined;
  const sort = isControlled ? controlled ?? null : local;
  const toggle = (key: string) => {
    const next: SortState = sort?.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
    if (isControlled) onSortChange(next.key, next.dir); else setLocal(next);
  };
  const sorted = useMemo(() => {
    if (!rows) return [];
    if (!sort || isControlled) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => {
      const va = f(a), vb = f(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns, isControlled]);
  if (loading) {
    return (
      <div className="overflow-auto">
        <table className="tbl" aria-busy="true">
          <thead><tr>{columns.map((c) => <th key={c.key} style={{ width: c.width }} className={cn(c.align === "right" && "!text-right", hideCls(c))}>{c.header}</th>)}</tr></thead>
          <SkeletonRows columns={columns} twoLine={twoLine} />
        </table>
      </div>
    );
  }
  if (!rows?.length) return typeof empty === "string" || empty == null ? <Empty title={empty ?? "No records"} /> : <>{empty}</>;
  return (
    <div className="overflow-auto">
      <table className={cn("tbl", layout === "fixed" && "table-fixed")}>
        <thead><tr>{columns.map((c) => (
          <th key={c.key} style={{ width: c.width }} aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
              className={cn(c.align === "right" && "!text-right", c.sort && "cursor-pointer select-none hover:text-crm-sand-900", sort?.key === c.key && "text-crm-sand-900", hideCls(c))}
              onClick={() => c.sort && toggle(c.key)}>
            <span className="inline-flex items-center gap-1">{c.header}{sort?.key === c.key && (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}</span>
          </th>))}</tr></thead>
        <tbody>{sorted.map((r) => (
          <tr key={r.id} className={cn(onRowClick && "clickable focus-visible:outline-2 focus-visible:outline-crm-accent-600 focus-visible:-outline-offset-2", twoLine && "row-2line")}
              tabIndex={onRowClick ? 0 : undefined} onClick={() => onRowClick?.(r)}
              onKeyDown={onRowClick ? (e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}>
            {columns.map((c) => <td key={c.key} style={c.maxWidth ? { maxWidth: c.maxWidth } : undefined} className={cn(c.align === "right" && "text-right num font-medium", c.nowrap && "whitespace-nowrap", c.maxWidth && "truncate", hideCls(c))}>{c.render(r)}</td>)}
          </tr>))}</tbody>
        {footer}
      </table>
    </div>
  );
}

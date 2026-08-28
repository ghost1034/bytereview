/* Table primitives (components.md §3). Markup is the `tbl` class family; these wrappers add density, sticky header,
 * sort affordances, mono numerics and the loading/empty/error slots. Pages own data, sorting and pagination. */
import { useCallback, useEffect, useState, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";
import { Segmented } from "./Segmented";
import { TableSkeleton } from "./Skeleton";
import { EmptyState, ErrorState } from "./EmptyState";

export type Density = "dense" | "normal";

/** Density persisted per table under `ta.density.<key>`. */
export function useDensity(key: string, initial: Density = "normal"): [Density, (d: Density) => void] {
  const storageKey = `ta.density.${key}`;
  const [d, setD] = useState<Density>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === "dense" || v === "normal" ? v : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (n: Density) => {
      setD(n);
      try {
        localStorage.setItem(storageKey, n);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );
  return [d, set];
}

/** Icon-only segmented density toggle (titles provide the names). */
export function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <Segmented<Density>
      ariaLabel="Row density"
      value={value}
      onChange={onChange}
      options={[
        {
          value: "dense",
          title: "Compact rows",
          label: (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          ),
        },
        {
          value: "normal",
          title: "Comfortable rows",
          label: (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 3h12M2 8h12M2 13h12" />
            </svg>
          ),
        },
      ]}
    />
  );
}

/** Bordered region that hosts a toolbar, a scrolling table and a footer. */
export function TableRegion({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("region flex min-h-0 flex-col overflow-hidden", className)}>{children}</div>;
}

/** Toolbar row above the table (sort summary, density toggle, column chooser). */
export function TableToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("toolbar border-b border-hairline px-3", className)}>{children}</div>;
}

/** Scroll container; set `maxHeight` to keep the footer visible. */
export function TableScroll({ children, maxHeight, className }: { children: ReactNode; maxHeight?: string | number; className?: string }) {
  return (
    <div className={cn("tbl-wrap", className)} style={maxHeight !== undefined ? { maxHeight } : undefined}>
      {children}
    </div>
  );
}

export function Table({ dense, children, className, ariaLabel, dim, ...rest }: { dense?: boolean; children: ReactNode; className?: string; ariaLabel?: string; /** Dim the body while refetching a later page. */ dim?: boolean } & Omit<React.TableHTMLAttributes<HTMLTableElement>, "className">) {
  return (
    <table className={cn("tbl", dense && "dense", dim && "[&>tbody]:opacity-60", className)} aria-label={ariaLabel} {...rest}>
      {children}
    </table>
  );
}

export type SortDir = "asc" | "desc" | null;

/** Header cell. Pass `sort`/`onSort` to make it sortable; the chevron shows on the sorted column and on hover. */
export function Th({
  align = "left",
  sort,
  onSort,
  width,
  children,
  className,
  ...rest
}: { align?: "left" | "right"; sort?: SortDir; onSort?: () => void; width?: number | string; children?: ReactNode; className?: string } & Omit<ThHTMLAttributes<HTMLTableCellElement>, "align" | "width" | "className">) {
  const ariaSort = sort === "asc" ? "ascending" : sort === "desc" ? "descending" : undefined;
  return (
    <th scope="col" className={cn(align === "right" && "num", className)} style={width !== undefined ? { width } : undefined} aria-sort={ariaSort} {...rest}>
      {onSort ? (
        <button type="button" className="sortable" onClick={onSort}>
          {children}
          <svg className="sort" viewBox="0 0 8 8" aria-hidden="true">
            <path d="M1 3l3 3 3-3" />
          </svg>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({ align = "left", mono, className, children, ...rest }: { align?: "left" | "right"; mono?: boolean; className?: string; children?: ReactNode } & Omit<TdHTMLAttributes<HTMLTableCellElement>, "align" | "className">) {
  return (
    <td className={cn(align === "right" && "num", mono && "code", className)} {...rest}>
      {children}
    </td>
  );
}

/** Mono right-aligned numeric with an ink-3 unit suffix (`19.0 %`, `25,000 EUR`). Use inside `<Td align="right">`. */
export function Num({ children, unit, className, title }: { children: ReactNode; unit?: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn("num whitespace-nowrap", className)} title={title}>
      {children}
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

/** Primary text cell content: one-line title with an ink-3 `.sub` line (authority · reference). */
export function TitleCell({ title, sub, maxWidth }: { title: ReactNode; sub?: ReactNode; maxWidth?: number }) {
  return (
    <div className="min-w-0" style={maxWidth ? { maxWidth } : undefined}>
      <span className="t block truncate" title={typeof title === "string" ? title : undefined}>
        {title}
      </span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

/** Loading / empty / error slots spanning all columns. */
export function TableState({ colSpan, loading, error, empty, onRetry, what, emptyAction, rows = 8 }: { colSpan: number; loading?: boolean; error?: unknown; empty?: boolean; onRetry?: () => void; what?: string; emptyAction?: ReactNode; rows?: number }) {
  if (!loading && !error && !empty) return null;
  return (
    <tbody>
      <tr>
        <td colSpan={colSpan} className="!h-auto !p-0">
          {loading ? <TableSkeleton rows={rows} cols={4} /> : error ? <ErrorState error={error} onRetry={onRetry} what={what} /> : <EmptyState title={`No ${what ?? "rows"} match these filters.`} action={emptyAction} />}
        </td>
      </tr>
    </tbody>
  );
}

/** `j`/`k` or arrows move the selected row; Enter opens. Returns the focused index and a setter. */
export function useRowKeys(count: number, onOpen: (i: number) => void, enabled = true): [number, (i: number) => void] {
  const [i, setI] = useState(-1);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "j" || e.key === "ArrowDown") setI((v) => Math.min(count - 1, v + 1));
      else if (e.key === "k" || e.key === "ArrowUp") setI((v) => Math.max(0, v - 1));
      else if (e.key === "Enter" && i >= 0) onOpen(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onOpen, enabled, i]);
  return [i, setI];
}

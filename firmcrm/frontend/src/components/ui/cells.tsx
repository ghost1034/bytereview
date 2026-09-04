/* Shared table-cell and filter-row helpers (DESIGN.md §6.3 filter rows, §6.6 cells). */
import type { InputHTMLAttributes, ReactNode } from "react";
import { Search } from "lucide-react";
import { Badge, Input, cn } from "./index";
import { fmtDate, money } from "@/lib/format";

/** Em dash in the disabled tone: empty numerics, blank dates, blank facts. */
export const Dash = () => <span className="text-sand-300">—</span>;
/** Money cell. DataTable's `align: "right"` already applies tabular 500; zero/empty renders a dash. */
export const cellMoney = (n: number | null | undefined): ReactNode => (n ? money(n) : <Dash />);
/** Count cell: counts render at 400 (lighter than money) per §6.6; zero renders a dash. */
export const cellCount = (n: number | null | undefined): ReactNode => (n ? <span className="font-normal">{n}</span> : <Dash />);
/** Date cell: tabular, never wraps; blank dates render a dash instead of the formatter's string em dash. */
export const cellDate = (s: string | null | undefined): ReactNode => (s ? <span className="num whitespace-nowrap">{fmtDate(s)}</span> : <Dash />);
/** Text cell that never wraps; pass `max` (px) to truncate with a title tooltip. Blank renders a dash. */
export const cellText = (v: string | null | undefined, max?: number): ReactNode =>
  v ? <span className={cn("whitespace-nowrap", max ? "block truncate" : null)} style={max ? { maxWidth: max } : undefined} title={max ? v : undefined}>{v}</span> : <Dash />;
/** Record-name cell: 13px/500 name, optional 12px tertiary second line, optional trailing chips. Truncates at `max` px (default 320). */
export function NameCell({ name, sub, chips, max = 320, title }: { name: ReactNode; sub?: ReactNode; chips?: ReactNode; max?: number; title?: string }) {
  return (
    <div className="min-w-0" style={{ maxWidth: max }}>
      <div className="flex items-center gap-2 font-medium text-sand-900"><span className="truncate" title={title ?? (typeof name === "string" ? name : undefined)}>{name}</span>{chips}</div>
      {sub ? <div className="truncate text-[12px] leading-4 text-sand-500">{sub}</div> : null}
    </div>
  );
}
/** Neutral chip marking an archived row (archived is a state, not an alarm). */
export const ArchivedChip = () => <Badge>Archived</Badge>;
/** 32px search field with a leading icon for filter rows. Width defaults to 280px; pass `className` to override. */
export function SearchInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className ?? "w-[280px]")}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sand-400" aria-hidden />
      <Input {...p} className="!pl-8" />
    </div>
  );
}
/** Quiet checkbox toggle for filter rows ("Show archived", "Show lifted"). */
export function FilterToggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] leading-4 text-sand-600 select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />{children}
    </label>
  );
}
/** Result count for filter rows: 12px tertiary, tabular. */
export const ResultCount = ({ children }: { children: ReactNode }) => <span className="num text-[12px] leading-4 text-sand-500">{children}</span>;


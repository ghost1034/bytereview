/* Filter bar (components.md §7): search input + active filter chips + "+ Add" chips + result sentence.
 * All filter state is owned by the page (URL); these are presentational with callbacks. */
import { useState, type ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";
import { fmtInt } from "@/taxatlas-ui/lib/format";
import { Popover } from "./Popover";
import { Input } from "./Fields";

/** Row container. Pass `result` to render the right-aligned "38 of 699 match · clear" sentence (hidden when no filters). */
export function ChipBar({
  children,
  result,
  className,
  ariaLabel = "Filters",
}: {
  children: ReactNode;
  result?: { count: number; total: number; active: number; onClear: () => void };
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("chips", className)} role="group" aria-label={ariaLabel}>
      {children}
      {result && result.active > 0 && (
        <span className="chip-sentence">
          <b>{fmtInt(result.count)}</b> of {fmtInt(result.total)} match ·{" "}
          <button type="button" className="underline decoration-hairline-strong underline-offset-2 hover:text-ink-1" onClick={result.onClear}>
            clear
          </button>
        </span>
      )}
    </div>
  );
}

/** Active filter chip: ink-3 label, ink-1 value (mono for codes/dates), × to remove. Click the body to edit. */
export function FilterChip({ label, value, mono, onRemove, onClick, className }: { label: ReactNode; value: ReactNode; mono?: boolean; onRemove: () => void; onClick?: () => void; className?: string }) {
  const body = (
    <>
      <span className="faint">{label}</span>
      <b className={mono ? "mono" : undefined}>{value}</b>
    </>
  );
  return (
    <span className={cn("chip", className)}>
      {onClick ? (
        <button type="button" className="inline-flex items-center gap-1.5" onClick={onClick}>
          {body}
        </button>
      ) : (
        body
      )}
      <button type="button" className="x" aria-label="Remove filter" title={typeof label === "string" ? `Remove ${label} filter` : undefined} onClick={onRemove}>
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </span>
  );
}

/** Dashed "+ Label" chip. Wrap in `ChipPicker` for a checklist popover, or handle `onClick` yourself. */
export function AddFilterChip({ label, onClick, className, ...rest }: { label: ReactNode; onClick?: () => void; className?: string } & Record<string, unknown>) {
  return (
    <button type="button" className={cn("chip chip-add", className)} onClick={onClick} {...rest}>
      + {label}
    </button>
  );
}

export interface PickerOption {
  value: string;
  label: string;
  count?: number;
}

/** "+ Status" chip that opens a checklist popover (240 px; search field when > 8 options). */
export function ChipPicker({ label, options, values, onChange, multi = true }: { label: string; options: PickerOption[]; values: string[]; onChange: (next: string[]) => void; multi?: boolean }) {
  const [q, setQ] = useState("");
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()) || o.value.includes(q.toLowerCase())) : options;
  return (
    <Popover width={240} trigger={({ props }) => <AddFilterChip label={label} {...props} />}>
      {({ close }) => (
        <div className="flex flex-col gap-1 p-1">
          {options.length > 8 && <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${label.toLowerCase()}…`} aria-label={`Filter ${label} options`} className="mb-1 h-[26px]" />}
          <div className="max-h-[260px] overflow-auto">
            {filtered.map((o) => {
              const on = values.includes(o.value);
              return (
                <label key={o.value} className="menu-item cursor-pointer">
                  <input
                    type={multi ? "checkbox" : "radio"}
                    checked={on}
                    onChange={() => {
                      if (multi) onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value]);
                      else {
                        onChange([o.value]);
                        close();
                      }
                    }}
                  />
                  <span className="truncate">{o.label}</span>
                  {o.count !== undefined && <span className="meta">{fmtInt(o.count)}</span>}
                </label>
              );
            })}
            {filtered.length === 0 && <div className="px-2 py-1.5 text-xs text-ink-3">No options match.</div>}
          </div>
        </div>
      )}
    </Popover>
  );
}

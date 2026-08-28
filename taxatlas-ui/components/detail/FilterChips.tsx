/* Filter bar as chips (components.md §7). Each chip wraps a native control so the filters stay
   keyboard-operable and addressable by label (E2E: getByLabel("Tax type").selectOption(...)).
   Built locally for WP-C; WP-A may absorb into components/ui/FilterBar.tsx. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useDebounced } from "@/taxatlas-ui/hooks/useDebounced";
import "./lists.css";

export function FilterRow({ children, label = "Filters" }: { children: ReactNode; label?: string }) {
  return (
    <div className="ta-filters" role="group" aria-label={label}>
      {children}
    </div>
  );
}

const X = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 2l6 6M8 2l-6 6" />
  </svg>
);

/** Search input; `/` focuses it from anywhere on the page. Debounced 250 ms into `onCommit`. */
export function SearchChip({ value, onCommit, placeholder, width = 260, label = "Search" }: { value: string; onCommit: (v: string) => void; placeholder: string; width?: number; label?: string }) {
  const [q, setQ] = useState(value);
  const dq = useDebounced(q, 250);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (dq !== value) onCommit(dq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);
  useEffect(() => {
    // external reset (e.g. "clear") → mirror into local state
    if (value !== q && value !== dq) setQ(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="ta-q" style={{ width }}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={label} />
      {q ? (
        <button type="button" className="x" aria-label="Clear search" onClick={() => setQ("")}>
          <X />
        </button>
      ) : (
        <span className="kbd" aria-hidden="true">/</span>
      )}
    </div>
  );
}

/** Enum filter: dashed “+ Label” adder when empty, solid “Label Value ×” chip when set. The select overlays the chip. */
export function ChipSelect({ label, value, onChange, options, mono }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; mono?: boolean }) {
  const id = useId();
  const current = options.find((o) => o.value === value);
  const active = value !== "";
  return (
    <span className={active ? "ta-chip" : "ta-chip ta-chip-add"}>
      {active ? (
        <>
          <span className="lbl">{label}</span>
          <b className={mono ? "code" : undefined}>{current?.label ?? value}</b>
        </>
      ) : (
        <span>+ {label}</span>
      )}
      <select id={id} className="overlay" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{active ? `Any ${label.toLowerCase()}` : `+ ${label}`}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {active && (
        <button type="button" className="x" aria-label="Remove filter" title={`Remove ${label} filter`} onClick={() => onChange("")}>
          <X />
        </button>
      )}
    </span>
  );
}

/** Free-text filter (jurisdiction code, court, HS prefix). Debounced; `code` = mono + uppercase. */
export function ChipInput({ label, value, onChange, placeholder, code, digits, width }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; code?: boolean; digits?: boolean; width?: number }) {
  const [v, setV] = useState(value);
  const dv = useDebounced(v, 250);
  useEffect(() => {
    if (dv !== value) onChange(dv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dv]);
  useEffect(() => {
    if (value !== v && value !== dv) setV(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const active = v !== "";
  const norm = (s: string) => {
    let out = s;
    if (digits) out = out.replace(/\D/g, "");
    if (code) out = out.toUpperCase();
    return out;
  };
  return (
    <label className={active ? "ta-chip" : "ta-chip ta-chip-add"}>
      <span className="lbl">{active ? label : `+ ${label}`}</span>
      <input
        className={code ? "inline code" : "inline"}
        aria-label={label}
        value={v}
        placeholder={placeholder ?? ""}
        onChange={(e) => setV(norm(e.target.value))}
        style={{ width: width ?? `${Math.max(placeholder?.length ?? 2, v.length, 2) + 1}ch` }}
        inputMode={digits ? "numeric" : undefined}
      />
      {active && (
        <button type="button" className="x" aria-label="Remove filter" title={`Remove ${label} filter`} onClick={() => setV("")}>
          <X />
        </button>
      )}
    </label>
  );
}

/** Date filter rendered as “Label ≥ YYYY-MM-DD”. While empty the native input overlays the adder chip (opacity 0),
 *  so a click opens the picker and the control stays addressable by label. */
export function ChipDate({ label, shortLabel, op = "≥", value, onChange }: { label: string; shortLabel?: string; op?: "≥" | "≤" | "="; value: string; onChange: (v: string) => void }) {
  const active = value !== "";
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className={active ? "ta-chip" : "ta-chip ta-chip-add"} onClick={() => { if (!active) { try { ref.current?.showPicker?.(); } catch { /* focus fallback */ } } }}>
      <span className="lbl">{active ? (shortLabel ?? label) : `+ ${label}`}</span>
      {active && <span className="lbl">{op}</span>}
      <input ref={ref} type="date" className={active ? "inline" : "overlay"} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      {active && (
        <button type="button" className="x" aria-label="Remove filter" title={`Remove ${label} filter`} onClick={(e) => { e.preventDefault(); onChange(""); }}>
          <X />
        </button>
      )}
    </label>
  );
}

/** Right-aligned result sentence: “38 of 699 match · Reset (2)”. Hidden when no filter is active. */
export function ResultSentence({ shown, total, active, onReset, noun = "match" }: { shown: number | undefined; total: number | undefined; active: number; onReset: () => void; noun?: string }) {
  if (!active) return null;
  return (
    <span className="ta-sentence">
      {shown != null && <b>{new Intl.NumberFormat("en-US").format(shown)}</b>}
      {total != null && shown != null && <span>of {new Intl.NumberFormat("en-US").format(total)} {noun}</span>}
      <span>·</span>
      <button type="button" className="ta-link-btn" onClick={onReset}>
        Reset ({active})
      </button>
    </span>
  );
}

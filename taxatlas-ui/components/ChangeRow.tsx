/* ChangeRow (pages/changes.md): glyph · title · time, meta line (jref · tax type · entity #id · source),
   and an old → new mono diff for rate_changed / status_changed. Props kept stable for Overview, Account and the map panel. */
import type { ChangeEventOut } from "@/taxatlas-ui/lib/types";
import { fmtDate, fmtDateTime } from "@/taxatlas-ui/lib/format";
import { CHANGE_GLYPH, ENTITY_LABEL, TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import { JRef } from "@/taxatlas-ui/components/detail/JRef";
import { EntityGlyph } from "@/taxatlas-ui/components/detail/Marker";
import { Bilingual } from "@/taxatlas-ui/components/ui/Bilingual";
import "@/taxatlas-ui/components/detail/lists.css";

const DIFF_KEYS = ["rate", "status", "threshold_amount", "effective_from", "effective_to", "confidence", "name", "region", "currency"];

function fmtVal(k: string, v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    const s = Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, "");
    return k === "rate" ? `${s}%` : new Intl.NumberFormat("en-US").format(v);
  }
  if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}/.test(v) ? fmtDate(v) : v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return JSON.stringify(v);
}

/** Admin writes carry `new_value._meta = { edited_by, reason? }` (api-guide §6). Non-admin readers see "admin". */
export interface EditMeta {
  edited_by?: string | null;
  reason?: string | null;
}
export function editMeta(c: Pick<ChangeEventOut, "new_value">): EditMeta | null {
  const m = (c.new_value as Record<string, unknown> | null)?._meta;
  return m && typeof m === "object" ? (m as EditMeta) : null;
}

/** Compact old → new diff; old in ink-3 with strike, new in ink-1. Up to four changed keys, meaningful keys first.
 *  `_meta` is provenance, not a field change: it renders as an "edited by … · reason: …" line, never as a diff row. */
export function ChangeDiff({ c }: { c: ChangeEventOut }) {
  const o = c.old_value ?? {};
  const n = c.new_value ?? {};
  const meta = editMeta(c);
  const changed = Array.from(new Set([...Object.keys(o), ...Object.keys(n)])).filter((k) => k !== "_meta" && JSON.stringify(o[k]) !== JSON.stringify(n[k]));
  // For a rate change the effective window moving is implied; show only the figure (old → new).
  const valueChanged = changed.includes("rate") || changed.includes("threshold_amount");
  const keys = changed
    .filter((k) => !(valueChanged && (k === "effective_from" || k === "effective_to")))
    .sort((a, b) => {
      const ia = DIFF_KEYS.indexOf(a);
      const ib = DIFF_KEYS.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  if (keys.length === 0 && !meta) return null;
  return (
    <>
      {keys.length > 0 && (
        <span className="d">
          {keys.slice(0, 4).map((k) => (
            <span key={k}>
              {k !== "rate" && <span className="k">{k.replace(/_/g, " ")} </span>}
              <span className="old">{fmtVal(k, o[k])}</span>
              <span className="arr">→</span>
              <span className="new">{fmtVal(k, n[k])}</span>
            </span>
          ))}
        </span>
      )}
      {meta && (
        <span className="prov">
          edited by <span className="mono">{meta.edited_by || "admin"}</span>
          {meta.reason && <> · reason: {meta.reason}</>}
        </span>
      )}
    </>
  );
}

export function ChangeRow({ c, compact, onOpen, fresh, sourceSlug, plainJurisdiction }: { c: ChangeEventOut; compact?: boolean; onOpen?: (c: ChangeEventOut) => void; fresh?: boolean; sourceSlug?: string | null; /** Render the jurisdiction as text, not a link (inside a jurisdiction page). */ plainJurisdiction?: boolean }) {
  const showDiff = !compact && (c.change_type === "rate_changed" || c.change_type === "status_changed" || c.change_type === "updated");
  const time = fmtDateTime(c.detected_at);
  const cls = ["ta-change", compact ? "compact" : "", fresh ? "fresh" : ""].filter(Boolean).join(" ");
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag className={cls} onClick={onOpen ? () => onOpen(c) : undefined} type={onOpen ? "button" : undefined} aria-label={onOpen ? `Open ${label(ENTITY_LABEL, c.entity_type).toLowerCase()} ${c.entity_id}` : undefined}>
      <span className="g" data-type={c.change_type} title={label({}, c.change_type)} aria-label={label({}, c.change_type)}>
        {CHANGE_GLYPH[c.change_type] ?? "·"}
      </span>
      <span className="t" title={c.title_en ? `${c.title}\n${c.title_en}` : c.title}>
        <Bilingual original={c.title} translation={c.title_en} table />
      </span>
      <time dateTime={c.detected_at} title={time}>
        {compact ? time.slice(0, 10) : time.slice(11, 16)}
      </time>
      <span className="m">
        {plainJurisdiction ? c.jurisdiction && <span className="mono">{c.jurisdiction.code}</span> : <JRef j={c.jurisdiction} />}
        {c.tax_type && <span>{label(TAX_TYPE_LABEL, c.tax_type)}</span>}
        <span className="ent">
          <EntityGlyph type={c.entity_type} /> {label(ENTITY_LABEL, c.entity_type)} <span className="mono">#{c.entity_id}</span>
        </span>
        {sourceSlug && <span className="mono">{sourceSlug}</span>}
        {c.source_id == null && c.change_type !== "created" && <span>editorial</span>}
      </span>
      {showDiff && <ChangeDiff c={c} />}
    </Tag>
  );
}

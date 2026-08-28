/* Rates grouped by tax type (jurisdiction-detail.md): `grp` rows with caps label + count pill, Kind with description `.sub`,
   mono value with unit suffix, effective date, confidence marker, source link. `compact` is used by the map slide-over.
   Expired rows (effective_to in the past) render in ink-3 with the value struck through. */
import type { TaxRateOut } from "@/taxatlas-ui/lib/types";
import { fmtDate, fmtRate } from "@/taxatlas-ui/lib/format";
import { RATE_KIND_LABEL, TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import { ConfidenceMarker, CountPill } from "@/taxatlas-ui/components/detail/Marker";
import { SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import "@/taxatlas-ui/components/detail/lists.css";

const TYPE_ORDER = Object.keys(TAX_TYPE_LABEL);
const KIND_ORDER = Object.keys(RATE_KIND_LABEL);
const kindIdx = (k: string) => { const i = KIND_ORDER.indexOf(k); return i === -1 ? 99 : i; };

export function rateParts(r: { rate: number | null; threshold_amount: number | null; threshold_currency: string | null; description: string | null }): { value: string; unit: string } {
  if (r.rate != null) return { value: fmtRate(r.rate, 3).slice(0, -1), unit: "%" }; // "19%" → cell text matches fmtRate exactly
  if (r.threshold_amount != null) return { value: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(r.threshold_amount), unit: r.threshold_currency ?? "" };
  return { value: r.description ?? "—", unit: "" };
}

export function isExpired(r: TaxRateOut, today = new Date().toISOString().slice(0, 10)): boolean {
  return !!r.effective_to && r.effective_to < today;
}

export function RatesByType({ grouped, compact, onEdit, onRecordNew, hideHead }: { grouped: Record<string, TaxRateOut[]>; compact?: boolean; onEdit?: (rate: TaxRateOut) => void; onRecordNew?: (rate: TaxRateOut) => void; hideHead?: boolean }) {
  const types = Object.keys(grouped).sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  if (types.length === 0) return <div className="ta-empty" style={{ padding: "24px 10px", textAlign: "center" }}>No current rates recorded.</div>;
  const cols = compact ? 2 : 5;
  return (
    <table className={compact ? "ta-rates compact" : "ta-rates"} aria-label="Rates by tax type">
      {!hideHead && !compact && (
        <thead>
          <tr>
            <th style={{ width: "30%" }}>Kind</th>
            <th className="num" style={{ width: 96 }}>Value</th>
            <th style={{ width: 104 }}>Effective</th>
            <th style={{ width: 104 }}>Confidence</th>
            <th>Source</th>
            {onEdit && <th className="act" style={{ width: 156 }}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
      )}
      <tbody>
        {types.map((t) => (
          <RateGroup key={t} type={t} rows={grouped[t]} compact={compact} cols={cols + (onEdit ? 1 : 0)} onEdit={onEdit} onRecordNew={onRecordNew} />
        ))}
      </tbody>
    </table>
  );
}

function RateGroup({ type, rows, compact, cols, onEdit, onRecordNew }: { type: string; rows: TaxRateOut[]; compact?: boolean; cols: number; onEdit?: (r: TaxRateOut) => void; onRecordNew?: (r: TaxRateOut) => void }) {
  return (
    <>
      <tr className="grp">
        <td colSpan={cols}>
          <span>{label(TAX_TYPE_LABEL, type)}</span>
          <CountPill n={rows.length} />
        </td>
      </tr>
      {[...rows].sort((a, b) => kindIdx(a.rate_kind) - kindIdx(b.rate_kind) || (b.effective_from ?? "").localeCompare(a.effective_from ?? "")).map((r) => {
        const { value, unit } = rateParts(r);
        const expired = isExpired(r);
        const kind = label(RATE_KIND_LABEL, r.rate_kind);
        if (compact) {
          // Map drawer (448 px): kind + description + meta (confidence · as of · source host) left, mono value right.
          return (
            <tr key={r.id} className={expired ? "expired" : undefined}>
              <td>
                {kind}
                {r.description && <span className="sub" title={r.description}>{r.description}</span>}
                <span className="m">
                  <ConfidenceMarker level={r.confidence} />
                  {r.as_of && <span className="mono">as of {fmtDate(r.as_of)}</span>}
                  {r.effective_from && !r.as_of && <span className="mono">from {fmtDate(r.effective_from)}</span>}
                  {r.source_url ? <SourceLink href={r.source_url} /> : r.source_name ? <span>{r.source_name}</span> : null}
                </span>
              </td>
              <td className="v num" title={r.notes ?? undefined}>
                {value}
                {unit && <small>{unit}</small>}
              </td>
            </tr>
          );
        }
        return (
          <tr key={r.id} className={expired ? "expired" : undefined}>
            <td>
              {kind}
              {(r.description || r.applies_to) && (
                <span className="sub" title={[r.description, r.applies_to].filter(Boolean).join(" · ")}>
                  {[r.description, r.applies_to].filter(Boolean).join(" · ")}
                </span>
              )}
            </td>
            <td className="v num" title={r.notes ?? undefined}>
              {value}
              {unit && <small>{unit}</small>}
            </td>
            <td className="date" title={r.as_of ? `as of ${fmtDate(r.as_of)}` : undefined}>
              {r.effective_from ? fmtDate(r.effective_from) : "—"}
              {r.effective_to && <span className="ta-faint"> → {fmtDate(r.effective_to)}</span>}
            </td>
            <td>
              <ConfidenceMarker level={r.confidence} />
            </td>
            <td className="src">
              {r.source_url ? <SourceLink href={r.source_url}>{r.source_name ?? undefined}</SourceLink> : <span className="ta-faint">{r.source_name ?? "—"}</span>}
            </td>
            {onEdit && (
              <td className="act">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(r)} aria-label={`Correct ${kind} rate`} title="Correct this row in place">
                  Correct
                </button>
                {onRecordNew && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRecordNew(r)} aria-label={`Record new ${kind} rate`} title="Record a new rate that supersedes this row">
                    Supersede
                  </button>
                )}
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}

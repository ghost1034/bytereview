import type { BinMethod, Bins } from "@/taxatlas-ui/lib/geo";
import { rampIndices } from "@/taxatlas-ui/lib/geo";
import { binLabel, fmtTick, metricUnit, type MetricDef } from "@/taxatlas-ui/lib/rates";
import { errorMessage } from "@/taxatlas-ui/components/ui/Toast";
import { PALETTES, rampVars, type PaletteId } from "./palette";

interface Props {
  /** Null when the drilled country has geometry but no sub-national rate data yet. */
  metric: MetricDef | null;
  /** Drill context for the empty state: "18 regions". */
  scopeNoun?: string;
  /** Whether the drawn units have jurisdiction records (clickable) — false when only geometry exists. */
  hasRecords?: boolean;
  bins: Bins;
  /** Jurisdictions in the layer (with or without data). */
  total: number;
  /** ISO date shown in the as-of line. */
  asOf: string;
  /** True when asOf is the API's max as_of over points with data; false when it is today's "in force" date. */
  asOfFromData: boolean;
  /** Up to two source names (most frequent first) from the choropleth response. */
  sources: string[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  method: BinMethod;
  onMethod: (m: BinMethod) => void;
  palette: PaletteId;
  onPalette: (p: PaletteId) => void;
  /** Currency for amount metrics when every shaded jurisdiction reports the same one; null = mixed / unknown. */
  currency?: string | null;
  /** True when amount values are in several local currencies (bins are then indicative only). */
  mixedCurrencies?: boolean;
}

/** Legend attached to the active metric, inside the layer rail (components.md §12): k discrete bins as 8 px
 *  swatches with mono tick labels at the bin edges (unit on the last), hatched no-data swatch with its count,
 *  then the as-of line. Never a continuous gradient. */
export function Legend({ metric, scopeNoun, hasRecords, bins, total, asOf, asOfFromData, sources, loading, error, onRetry, method, onMethod, palette, onPalette, currency, mixedCurrencies }: Props) {
  const paletteRow = <PaletteControl value={palette} onChange={onPalette} />;
  if (!metric) {
    return (
      <div className="mp-legend" aria-label="Legend">
        <div className="h">
          <b>Sub-national rates</b>
          <span className="cov">
            <span>0 with data</span>
          </span>
        </div>
        <p className="empty">
          No sub-national rate data yet{scopeNoun ? ` — ${scopeNoun} drawn as geography only` : ""}.{" "}
          {hasRecords ? "Click a unit to open its record." : "No jurisdiction records seeded for this country yet."}
        </p>
        <div className="nd">
          <i className="mp-hatch" aria-hidden="true" />
          No rates tracked
          {total > 0 && <span className="n">{total}</span>}
        </div>
        {paletteRow}
      </div>
    );
  }
  const k = bins.ticks.length;
  const idx = rampIndices(k);
  const unit = metricUnit(metric, metric.unit === "amount" ? (currency ?? "") : undefined);
  const noData = Math.max(0, total - bins.n);

  return (
    <div className="mp-legend" aria-label="Legend">
      <div className="h">
        <b title={metric.label}>{metric.label}</b>
        <span className="cov">
          {error ? null : loading && bins.n === 0 ? "loading…" : <span>{bins.n} with data</span>}
        </span>
      </div>

      {error ? (
        <div className="err">
          Could not load {metric.label} · {errorMessage(error)}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      ) : k === 0 ? (
        <div className="mp-note" style={{ padding: "2px 0 0" }}>
          {loading ? "Binning rates…" : "No values for this metric."}
        </div>
      ) : (
        <>
          <div className="mp-bins" style={{ gridTemplateColumns: `repeat(${k}, 1fr)` }} role="img" aria-label={`${k} bins from ${fmtTick(metric, bins.min)}${unit} to ${fmtTick(metric, bins.max)}${unit}`}>
            {bins.ticks.map((_, i) => (
              <i key={i} style={{ background: `var(--viz-seq-${idx[i] + 1})` }} title={`${binLabel(metric, bins.ticks, i)} · ${bins.counts[i]}`} />
            ))}
          </div>
          <div className="mp-ticks" style={{ gridTemplateColumns: `repeat(${k}, 1fr)` }} aria-hidden="true">
            {bins.ticks.map((t, i) => (
              <span key={i}>
                {fmtTick(metric, t)}
                {i === k - 1 ? (k > 1 ? `${unit}+` : unit) : ""}
              </span>
            ))}
          </div>
          {metric.unit === "amount" && (
            <div className="mp-note" style={{ padding: "2px 0 0" }}>
              {mixedCurrencies ? "Amounts in each jurisdiction's own currency — bins are indicative; hover for the exact figure." : currency ? `Amounts in ${currency}.` : "Amounts in local currency."}
            </div>
          )}
        </>
      )}

      <div className="nd">
        <i className="mp-hatch" aria-hidden="true" />
        No {metric.short} / not tracked
        {!error && total > 0 && <span className="n">{noData}</span>}
      </div>

      <div className="asof">
        <span title={asOfFromData ? "Latest as-of date among jurisdictions with data" : "Rates in force on this date (latest effective rate per jurisdiction)"}>
          {asOfFromData ? "As of" : "In force as of"} <span className="mono">{asOf}</span>
          {sources.length > 0 && <> · {sources.join(", ")}</>}
        </span>
        {k > 1 && (
          <span className="mp-seg" role="group" aria-label="Bin method">
            <button type="button" aria-pressed={method === "quantile"} onClick={() => onMethod("quantile")} title="Quantile bins: equal counts per class">
              quantile
            </button>
            <button type="button" aria-pressed={method === "equal"} onClick={() => onMethod("equal")} title="Equal-interval bins: equal value ranges">
              equal
            </button>
          </span>
        )}
      </div>
      {paletteRow}
    </div>
  );
}

/** Four sequential ramps as miniature swatches; selection is the brass outline (the system's only accent use). */
function PaletteControl({ value, onChange }: { value: PaletteId; onChange: (p: PaletteId) => void }) {
  return (
    <div className="mp-palette" role="group" aria-label="Palette">
      <span className="lbl">Palette</span>
      <span className="opts">
        {PALETTES.map((p) => (
          <button key={p.id} type="button" aria-pressed={value === p.id} aria-label={`Palette: ${p.label}`} title={`${p.label} — ${p.hint}`} onClick={() => onChange(p.id)}>
            {rampVars(p.id).map((v) => (
              <i key={v} style={{ background: v }} aria-hidden="true" />
            ))}
          </button>
        ))}
      </span>
    </div>
  );
}

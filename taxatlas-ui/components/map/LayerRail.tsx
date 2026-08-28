import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DrillLayer } from "@/taxatlas-ui/lib/geo";
import { OVERLAY_DEFS, OVERLAY_KEYS, groupMetrics, rowLabel, type MetricDef, type OverlayKey } from "@/taxatlas-ui/lib/rates";

/** Groups shown before the "Show all N metrics" control collapses the rest. */
const VISIBLE_GROUPS = 3;

interface Props {
  drill: DrillLayer | null;
  parentName: string;
  /** Country count for the scope line (world mode). */
  countryCount: number | null;
  /** Sub-national coverage for the scope row (world mode): countries with child rate data / with geometry. */
  subnational: { countries: number; geometry: number } | null;
  onWorld: () => void;
  /** Section heading: "Country metric" | "US · state metric". */
  title: string;
  /** Metrics in grouped order (lib/rates.ts metricsFor); the rail groups consecutive tax types. */
  metrics: MetricDef[];
  metric: string | null;
  onMetric: (id: string) => void;
  /** Jurisdictions with a value, per metric id. */
  coverage: Record<string, number | undefined>;
  overlays: Record<OverlayKey, boolean>;
  onOverlay: (k: OverlayKey, v: boolean) => void;
  /** Totals per overlay across all countries (from /map/activity). */
  overlayCounts: Record<OverlayKey, number> | null;
  notices?: ReactNode;
  /** The legend, rendered as the rail's last section. */
  children: ReactNode;
}

/** Layer rail (components.md §12): Scope, Metric (grouped one-of list with mono coverage counts and 1–9 hotkeys),
 *  Overlays (checkboxes with marker shapes), Legend. 252 px on --surface-glass, top-left.
 *
 *  Metric entries are <button aria-pressed> inside a role="group" rather than role="radio" in a radiogroup: the
 *  E2E contract addresses them as buttons by their full metric name (aria-label), while the visible text is the
 *  short row label under a tax-type header. Arrow keys move the selection across groups like a radio group. */
export function LayerRail({ drill, parentName, countryCount, subnational, onWorld, title, metrics, metric, onMetric, coverage, overlays, onOverlay, overlayCounts, notices, children }: Props) {
  const btns = useRef<Map<string, HTMLButtonElement>>(new Map());
  const groups = useMemo(() => groupMetrics(metrics), [metrics]);
  const [showAll, setShowAll] = useState(false);
  // A new scope (world ↔ country) starts collapsed again.
  const scopeKey = drill ? drill.parent : "world";
  useEffect(() => setShowAll(false), [scopeKey]);

  const selectedGroup = groups.findIndex((g) => g.metrics.some((m) => m.id === metric));
  const visibleGroups = showAll ? groups : groups.filter((_, i) => i < VISIBLE_GROUPS || i === selectedGroup);
  const hiddenCount = metrics.length - visibleGroups.reduce((n, g) => n + g.metrics.length, 0);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (metrics.length === 0) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const cur = metrics.findIndex((m) => m.id === metric);
    let next = cur;
    if (e.key === "ArrowDown") next = (cur + 1) % metrics.length;
    if (e.key === "ArrowUp") next = (cur - 1 + metrics.length) % metrics.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = metrics.length - 1;
    const target = metrics[next];
    if (!visibleGroups.some((g) => g.metrics.includes(target))) setShowAll(true);
    onMetric(target.id);
    requestAnimationFrame(() => btns.current.get(target.id)?.focus());
  };

  return (
    <aside className="mp-rail" aria-label="Map layers">
      <div className="mp-region">
        <div className="mp-scope">
          {drill ? (
            <>
              <button type="button" className="lvl" onClick={onWorld} title="Back to world">
                World
              </button>
              <span className="sep">›</span>
              <span className="lvl">{parentName}</span>
              <button type="button" className="back" onClick={onWorld} title="Back to world (Esc)">
                Back <span className="mp-kbd">Esc</span>
              </button>
            </>
          ) : (
            <>
              <span className="lvl">World</span>
              {countryCount != null && (
                <>
                  <span className="sep">·</span>
                  <span className="mp-mono">{countryCount}</span>
                  <span>countries</span>
                </>
              )}
            </>
          )}
        </div>
        {!drill && subnational && (
          <div className="mp-scope-sub" title={`${subnational.geometry} countries have sub-national geometry; click one and choose “Drill into …”`} data-testid="subnational-coverage">
            <span>
              <span className="mp-mono">{subnational.countries}</span> {subnational.countries === 1 ? "country" : "countries"} with sub-national rates
            </span>
            <span className="sep">·</span>
            <span>
              <span className="mp-mono">{subnational.geometry}</span> drillable
            </span>
          </div>
        )}
      </div>

      <div className="mp-region scroll">
        <div className="mp-sec mp-metrics" role="group" aria-label={title} onKeyDown={onKey}>
          <div className="h">
            <span>{title}</span>
            {metrics.length > 0 && (
              <span className="mp-count" title={`${metrics.length} metrics available in this scope`}>
                <span className="mp-mono">{metrics.length}</span> metrics
              </span>
            )}
            {metrics.length > 0 && <span className="mp-kbd">1–{Math.min(9, metrics.length)}</span>}
          </div>
          {visibleGroups.map((g) => (
            <div className="mp-grp" key={g.key} role="group" aria-label={g.label}>
              <div className="mp-grp-h">
                <span>{g.label}</span>
                <span className="n">{g.metrics.length}</span>
              </div>
              {g.metrics.map((m) => {
                const hotkey = metrics.indexOf(m) + 1;
                return (
                  <button
                    key={m.id}
                    ref={(el) => {
                      if (el) btns.current.set(m.id, el);
                      else btns.current.delete(m.id);
                    }}
                    type="button"
                    className="mp-opt"
                    aria-pressed={m.id === metric}
                    aria-label={m.label}
                    onClick={() => onMetric(m.id)}
                    title={hotkey <= 9 ? `${m.label} — hotkey ${hotkey}` : m.label}
                  >
                    <i className="sw" aria-hidden="true" />
                    <span className="lbl">{rowLabel(m)}</span>
                    <span className="n">{coverage[m.id] ?? ""}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {metrics.length === 0 && <div className="mp-note">No sub-national rate metrics for this country yet.</div>}
          {groups.length > VISIBLE_GROUPS && (
            <button type="button" className="mp-more" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? "Show fewer" : `Show all ${metrics.length} metrics`}
              {!showAll && hiddenCount > 0 && <span className="n">+{hiddenCount}</span>}
            </button>
          )}
        </div>

        <div className="mp-sec" aria-label="Overlays">
          <div className="h">
            <span>Overlays · 30 d</span>
          </div>
          {OVERLAY_KEYS.map((k) => {
            const def = OVERLAY_DEFS[k];
            return (
              <button key={k} type="button" role="checkbox" aria-checked={overlays[k]} className="mp-opt" onClick={() => onOverlay(k, !overlays[k])}>
                <i className="box" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </i>
                <i className={`mp-ov ${def.marker}`} aria-hidden="true" />
                <span className="lbl">{def.label}</span>
                <span className="n">{overlayCounts ? overlayCounts[k] : ""}</span>
              </button>
            );
          })}
          {notices}
        </div>

        <div className="mp-sec">{children}</div>
      </div>
    </aside>
  );
}

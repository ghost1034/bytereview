import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "@/taxatlas-ui/lib/navigation";
import { ApiError, api } from "@/taxatlas-ui/lib/api";
import {
  WORLD_BOUNDS,
  WORLD_METRICS,
  buildDrillRegistry,
  computeBins,
  loadAdmin1,
  loadAdmin1Manifest,
  loadWorld,
  pluralLevel,
  type BinMethod,
  type DrillLayer,
  type GeoFC,
} from "@/taxatlas-ui/lib/geo";
import { OVERLAY_KEYS, defaultMetricId, legendProvenance, metricsFor, type MetricDef, type OverlayKey } from "@/taxatlas-ui/lib/rates";
import type { ChoroplethPoint, JurisdictionOut } from "@/taxatlas-ui/lib/types";
import { WorldMap, type HoverInfo, type WorldMapHandle } from "@/taxatlas-ui/components/map/WorldMap";
import { LayerRail } from "@/taxatlas-ui/components/map/LayerRail";
import { Legend } from "@/taxatlas-ui/components/map/Legend";
import { MapControls } from "@/taxatlas-ui/components/map/MapControls";
import { MapTooltip } from "@/taxatlas-ui/components/map/MapTooltip";
import { JurisdictionPanel } from "@/taxatlas-ui/components/map/JurisdictionPanel";
import { PANEL_TABS, type PanelTab } from "@/taxatlas-ui/components/map/panelTabs";
import { useMapTheme } from "@/taxatlas-ui/components/map/theme";
import { DEFAULT_PALETTE, applyPalette, isPaletteId, readPalette, type PaletteId } from "@/taxatlas-ui/components/map/palette";
import { errorMessage } from "@/taxatlas-ui/components/ui/Toast";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import "@/taxatlas-ui/components/map/map.css";

const RAIL_W = 252;
const DRAWER_W = 480;
/** Pairs need a current rate in at least this many countries to earn a rail row (world scope). */
const WORLD_MIN_COVERAGE = 3;

/** Currency shared by every shaded amount, read off the API's labels ("100,000 USD"); null when mixed or absent. */
function sharedCurrency(points: ChoroplethPoint[] | undefined): { currency: string | null; mixed: boolean } {
  const seen = new Set<string>();
  for (const p of points ?? []) {
    if (p.value == null || !p.label) continue;
    const m = p.label.match(/([A-Z]{3})\s*$/);
    if (m) seen.add(m[1]);
  }
  if (seen.size === 1) return { currency: [...seen][0], mixed: false };
  return { currency: null, mixed: seen.size > 1 };
}

/** Distinct child levels, most frequent first (Canada: province ×10, territory ×3). The rail names the scope after
 *  the first; the choropleth is requested once per level because the API filters on a single level. */
function childLevels(children: JurisdictionOut[] | undefined): string[] {
  if (!children?.length) return [];
  const counts = new Map<string, number>();
  children.forEach((c) => counts.set(c.level, (counts.get(c.level) ?? 0) + 1));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([lvl]) => lvl);
}

export default function MapPage() {
  usePageTitle("Map");
  const [sp, setSp] = useSearchParams();

  // --- Drill registry ----------------------------------------------------------------------------------------
  // Which countries can be drilled into = /map/subnational (children + metrics) ∪ geometry manifest. Both are
  // fetched once; the URL's ?mode= is only honoured once they have settled so a deep link never flashes World.
  const manifestQ = useQuery({ queryKey: ["admin1-manifest"], queryFn: loadAdmin1Manifest, staleTime: Infinity, retry: 1 });
  const subQ = useQuery({
    queryKey: ["subnational"],
    queryFn: api.map.subnational,
    staleTime: 5 * 60_000,
    // An API without the endpoint (older deployment) answers 404: treat as "no sub-national data", do not retry.
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const registryReady = !manifestQ.isPending && !subQ.isPending;
  const registry = useMemo(() => buildDrillRegistry(subQ.data, manifestQ.data ?? null), [subQ.data, manifestQ.data]);

  // --- URL state ---------------------------------------------------------------------------------------------
  const modeParam = sp.get("mode");
  const drill: DrillLayer | null = modeParam && registryReady && registry[modeParam]?.geometry ? registry[modeParam] : null;
  const mode = drill ? drill.parent : "world";
  // A ?mode= we cannot honour yet (registry loading) keeps the page in a neutral state; one we will never honour
  // (unknown country) falls back to World.
  const modePending = !!modeParam && !registryReady;
  // World metric list is data-driven (/map/metrics); the curated five stand in until it arrives so the map paints
  // immediately and the URL's ?metric= can be validated without a flash.
  const worldMetricsQ = useQuery({
    queryKey: ["map-metrics", "country", WORLD_MIN_COVERAGE],
    queryFn: () => api.map.metrics({ level: "country", min_coverage: WORLD_MIN_COVERAGE }),
    staleTime: 5 * 60_000,
  });
  const worldMetrics = useMemo(() => (worldMetricsQ.data ? metricsFor(worldMetricsQ.data.metrics) : WORLD_METRICS), [worldMetricsQ.data]);
  const metrics: MetricDef[] = drill ? drill.metrics : worldMetrics;
  const fallbackMetricId = drill ? drill.defaultMetric : defaultMetricId(worldMetrics, WORLD_METRICS);
  const metricId = metrics.length === 0 ? null : metrics.some((m) => m.id === sp.get("metric")) ? sp.get("metric")! : fallbackMetricId;
  const metric = metricId ? (metrics.find((m) => m.id === metricId) ?? null) : null;
  const selected = sp.get("sel");
  const tab: PanelTab = PANEL_TABS.includes(sp.get("tab") as PanelTab) ? (sp.get("tab") as PanelTab) : "rates";
  const binMethod: BinMethod = sp.get("bins") === "equal" ? "equal" : "quantile";
  const urlOverlays = useMemo(() => {
    const on = new Set((sp.get("layers") ?? "").split(",").filter(Boolean));
    return Object.fromEntries(OVERLAY_KEYS.map((k) => [k, on.has(k)])) as Record<OverlayKey, boolean>;
  }, [sp]);
  // Mirror the URL state locally so a checkbox flips in the same event that toggles it: router navigations
  // commit as transitions, which is too late for assistive tech (and Playwright) reading aria-checked.
  const [overlays, setOverlays] = useState(urlOverlays);
  useEffect(() => setOverlays(urlOverlays), [urlOverlays]);
  const anyOverlay = OVERLAY_KEYS.some((k) => overlays[k]);

  const patch = useCallback(
    (p: Record<string, string | null>) =>
      setSp(
        (prev) => {
          const n = new URLSearchParams(prev);
          Object.entries(p).forEach(([k, v]) => (v == null || v === "" ? n.delete(k) : n.set(k, v)));
          return n;
        },
        { replace: true },
      ),
    [setSp],
  );

  // Deep link from a jurisdiction page: /map?focus=BR-SP → drill into BR (when it has geometry) and select the state.
  useEffect(() => {
    const focus = sp.get("focus");
    if (!focus || !registryReady) return;
    const parent = focus.includes("-") ? focus.split("-")[0] : null;
    patch({ focus: null, sel: focus, mode: parent && registry[parent]?.geometry ? parent : null, metric: null });
  }, [sp, patch, registryReady, registry]);

  // Drop an unknown ?mode= once we know it cannot be honoured, so the URL matches what is on screen.
  useEffect(() => {
    if (modeParam && registryReady && !registry[modeParam]?.geometry) patch({ mode: null, metric: null });
  }, [modeParam, registryReady, registry, patch]);

  // --- Geometry ----------------------------------------------------------------------------------------------
  const [geo, setGeo] = useState<GeoFC | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const manifest = manifestQ.data ?? null;
  useEffect(() => {
    let alive = true;
    setGeo(null);
    setGeoErr(null);
    if (modePending) return;
    (drill && manifest ? loadAdmin1(drill.parent, manifest) : loadWorld())
      .then((fc) => alive && setGeo(fc))
      .catch((e) => alive && setGeoErr(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [drill, manifest, modePending]);

  // --- Drill context -----------------------------------------------------------------------------------------
  // Children of the drilled country: supplies the level and names for geometry-only countries and makes every
  // unit clickable even when no metric has data. Same query key as the drawer's children tab (shared cache).
  const childrenQ = useQuery({ queryKey: ["children", mode], queryFn: () => api.jurisdictions.children(mode), enabled: !!drill, staleTime: 5 * 60_000 });
  const parentQ = useQuery({
    queryKey: ["jurisdiction", mode],
    queryFn: () => api.jurisdictions.get(mode),
    enabled: !!drill && drill.name === drill.parent, // registry knows the name when /map/subnational listed it
    staleTime: 5 * 60_000,
  });
  const parentName = drill ? (drill.name !== drill.parent ? drill.name : (parentQ.data?.name ?? drill.parent)) : "";
  // Levels to query: the children's distinct levels once known; until then the API's (or manifest's) single level.
  const levels = useMemo(() => {
    if (!drill) return ["country"];
    const fromChildren = childLevels(childrenQ.data);
    return fromChildren.length ? fromChildren : [drill.level];
  }, [drill, childrenQ.data]);
  const level = levels[0];
  const childCount = drill ? (childrenQ.data?.length ?? drill.children) : 0;

  // --- Data --------------------------------------------------------------------------------------------------
  // One choropleth query per child level for the active metric (world: one); coverage counts for the rail come
  // from /map/coverage per level and are summed (previously one choropleth request per metric — nine requests per
  // mode switch against the 120/min limit).
  const choro = useQueries({
    queries: levels.map((lvl) => ({
      queryKey: ["choropleth", mode, metric?.tax_type, metric?.rate_kind, lvl],
      queryFn: () => api.map.choropleth({ tax_type: metric!.tax_type, rate_kind: metric!.rate_kind, level: lvl, parent: drill?.parent }),
      enabled: !!metric && !modePending,
      staleTime: 5 * 60_000,
    })),
    // `combine` is memoised by react-query, so `data` keeps its identity until one of the queries changes.
    combine: (rs) => ({
      data: rs.length > 0 && rs.every((r) => r.data !== undefined) ? rs.flatMap((r) => r.data ?? []) : undefined,
      isLoading: rs.some((r) => r.isLoading),
      error: rs.find((r) => r.isError)?.error ?? null,
      refetch: () => rs.forEach((r) => r.refetch()),
    }),
  });
  // Children the choropleth did not return (other level, or a geography-only drill) become points without a value
  // so the map still knows their code and name and the drawer opens on click.
  const points: ChoroplethPoint[] | undefined = useMemo(() => {
    if (!drill) return choro.data;
    if (metric && !choro.data) return undefined;
    const base = metric ? (choro.data ?? []) : [];
    const have = new Set(base.map((p) => p.code));
    const extra = (childrenQ.data ?? []).filter((c) => !have.has(c.code)).map((c) => ({ code: c.code, name: c.name, iso_numeric: c.iso_numeric, fips: c.fips, value: null, label: null }));
    return extra.length ? [...base, ...extra] : base;
  }, [metric, choro.data, drill, childrenQ.data]);
  const coverageSum = useQueries({
    queries: levels.map((lvl) => ({
      queryKey: ["coverage", mode, lvl, metrics.map((m) => m.id).join(",")],
      queryFn: () => api.map.coverage({ metrics: metrics.map((m) => `${m.tax_type}:${m.rate_kind}`).join(","), level: lvl, parent: drill?.parent }),
      enabled: metrics.length > 0 && !modePending,
      staleTime: 5 * 60_000,
    })),
    combine: (rs): Record<string, number> | null => {
      if (!rs.every((r) => r.data !== undefined)) return null;
      const out: Record<string, number> = {};
      rs.forEach((r) => Object.entries(r.data!.metrics).forEach(([k, n]) => (out[k] = (out[k] ?? 0) + n)));
      return out;
    },
  });
  const coverage = useMemo(() => Object.fromEntries(metrics.map((m) => [m.id, coverageSum?.[`${m.tax_type}:${m.rate_kind}`]])), [metrics, coverageSum]);

  const activity = useQuery({ queryKey: ["activity", 30], queryFn: () => api.map.activity(30), enabled: !drill, staleTime: 5 * 60_000 });
  const overlayCounts = useMemo(() => {
    if (!activity.data) return null;
    const out = { changes: 0, court_decisions: 0, tariffs: 0 } as Record<OverlayKey, number>;
    activity.data.forEach((a) => OVERLAY_KEYS.forEach((k) => (out[k] += a[k])));
    return out;
  }, [activity.data]);
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats.overview, refetchInterval: 60_000 });

  const bins = useMemo(() => computeBins((points ?? []).map((p) => p.value).filter((v): v is number => v != null), binMethod), [points, binMethod]);
  // Legend provenance: the API's max as_of + top sources when present; otherwise the date the rates were
  // selected as "in force" (the choropleth picks the latest effective rate as of today).
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [points]); // eslint-disable-line react-hooks/exhaustive-deps -- re-stamp when data refreshes
  const provenance = useMemo(() => legendProvenance(points ?? []), [points]);
  const asOf = provenance.asOf ?? today;
  const ccy = useMemo(() => sharedCurrency(points), [points]);

  // --- Palette (sequential ramp) -------------------------------------------------------------------------------
  // ?palette= wins on load (shared links reproduce the presenter's colours), else the stored preference. Picking
  // one writes both; the DOM attribute is what tokens.css and colors.ts react to.
  const urlPalette = sp.get("palette");
  const [paletteId, setPaletteId] = useState<PaletteId>(() => (isPaletteId(urlPalette) ? urlPalette : readPalette()));
  useEffect(() => {
    if (isPaletteId(urlPalette) && urlPalette !== paletteId) setPaletteId(urlPalette);
  }, [urlPalette]); // eslint-disable-line react-hooks/exhaustive-deps -- URL → state only
  useEffect(() => {
    if (readPalette() !== paletteId || document.documentElement.dataset.palette !== (paletteId === DEFAULT_PALETTE ? undefined : paletteId)) applyPalette(paletteId);
  }, [paletteId]);
  const onPalette = useCallback(
    (id: PaletteId) => {
      setPaletteId(id);
      applyPalette(id);
      patch({ palette: id });
    },
    [patch],
  );

  // --- Theme, camera, pointer --------------------------------------------------------------------------------
  const { theme, palette, toggle: toggleTheme } = useMapTheme();
  const mapRef = useRef<WorldMapHandle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const bounds = drill ? drill.bounds : WORLD_BOUNDS;
  // Keep the fitted area clear of the rail, the controls strip, and the drawer when open.
  const padding = useMemo(() => ({ top: 56, bottom: 48, left: RAIL_W + 24, right: selected ? DRAWER_W + 16 : 0 }), [selected]);

  const onSelect = useCallback(
    (code: string, _name: string, overlay?: OverlayKey) => {
      const t: PanelTab | null = overlay === "changes" ? "changes" : overlay === "court_decisions" ? "courts" : overlay === "tariffs" ? "tariffs" : null;
      patch({ sel: code, tab: t });
    },
    [patch],
  );
  const exitScope = useCallback(() => drill && patch({ mode: null, metric: null, sel: drill.parent, tab: null }), [drill, patch]);
  const enterScope = useCallback((parent: string) => patch({ mode: parent, metric: null, sel: null, tab: null }), [patch]);

  // --- Keyboard (pages/map.md): esc closes drawer then exits scope; 1–n metric; + − 0 camera; l theme; ↵ drill.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "Escape":
          if (selected) patch({ sel: null, tab: null });
          else if (drill) exitScope();
          else return;
          break;
        case "Enter":
          if (selected && !drill && registry[selected]?.geometry && t?.tagName !== "BUTTON" && t?.tagName !== "A") enterScope(selected);
          else return;
          break;
        case "+":
        case "=":
          mapRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          mapRef.current?.zoomOut();
          break;
        case "0":
          mapRef.current?.reset();
          break;
        case "l":
        case "L":
          toggleTheme();
          break;
        default: {
          const n = Number.parseInt(e.key, 10);
          if (n >= 1 && n <= metrics.length && !e.shiftKey) patch({ metric: metrics[n - 1].id });
          else return;
        }
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, drill, metrics, patch, exitScope, enterScope, toggleTheme, registry]);

  // --- Export --------------------------------------------------------------------------------------------------
  const onExport = useMemo(() => {
    if (!points?.length || !metric) return null;
    return () => {
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = [["code", "name", "tax_type", "rate_kind", "value", "label", "as_of"], ...points.map((p) => [p.code, p.name, metric.tax_type, metric.rate_kind, p.value, p.label, asOf])];
      const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `taxatlas-${mode}-${metric.id.replace(":", "-")}-${asOf}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }, [points, metric, mode, asOf]);

  const s = stats.data;
  const lastCrawl = s?.last_crawl_at ? `${s.last_crawl_at.slice(0, 10)} ${s.last_crawl_at.slice(11, 16)} UTC` : "—";
  const subnationalSummary = useMemo(
    () => (registryReady ? { countries: subQ.data?.length ?? 0, geometry: Object.values(registry).filter((r) => r.geometry).length } : null),
    [registryReady, subQ.data, registry],
  );
  // Empty-state noun: children when the database has them, else the geometry's own unit count.
  const drillNoun = drill ? `${childCount || (drill.geometry?.features ?? 0)} ${pluralLevel(level)}` : undefined;

  return (
    <div ref={rootRef} className="mp-root">
      {/* Single page heading for assistive tech; the visible title is the rail's scope row. */}
      <h1 className="sr-only">{drill ? `Map · ${parentName}` : "Map · World"}</h1>
      <WorldMap
        ref={mapRef}
        geo={geo}
        points={points}
        joinField={drill ? "code" : "iso_numeric"}
        ticks={bins.ticks}
        palette={palette}
        activity={anyOverlay && !drill ? activity.data : undefined}
        overlays={overlays}
        selectedCode={selected}
        bounds={bounds}
        padding={padding}
        onSelect={onSelect}
        onHover={setHover}
      />

      <LayerRail
        drill={drill}
        parentName={parentName}
        countryCount={drill ? null : (points?.length ?? s?.countries ?? null)}
        subnational={subnationalSummary}
        onWorld={exitScope}
        title={drill ? `${drill.parent} · ${level} metric` : "Country metric"}
        metrics={metrics}
        metric={metricId}
        onMetric={(id) => patch({ metric: id })}
        coverage={coverage}
        overlays={overlays}
        onOverlay={(k, v) => {
          const next = { ...overlays, [k]: v };
          setOverlays(next);
          patch({ layers: OVERLAY_KEYS.filter((x) => next[x]).join(",") || null });
        }}
        overlayCounts={overlayCounts}
        notices={
          <>
            {drill && anyOverlay && <div className="mp-note">Overlays are country-level; return to World to see them.</div>}
            {!drill && anyOverlay && activity.isError && <div className="mp-note err">{errorMessage(activity.error)}</div>}
            {geoErr && <div className="mp-note err">Geometry failed to load: {geoErr}</div>}
            {!geo && !geoErr && <div className="mp-note">Loading geometry…</div>}
            {drill && childrenQ.isError && <div className="mp-note err">{errorMessage(childrenQ.error)}</div>}
          </>
        }
      >
        <Legend
          metric={metric}
          scopeNoun={drillNoun}
          hasRecords={childCount > 0}
          bins={bins}
          total={points?.length ?? 0}
          asOf={asOf}
          asOfFromData={provenance.asOf != null}
          sources={provenance.sources}
          loading={choro.isLoading}
          error={choro.error}
          onRetry={choro.refetch}
          method={binMethod}
          onMethod={(m) => patch({ bins: m === "quantile" ? null : m })}
          palette={paletteId}
          onPalette={onPalette}
          currency={ccy.currency}
          mixedCurrencies={ccy.mixed}
        />
      </LayerRail>

      <MapControls shifted={!!selected} theme={theme} onZoomIn={() => mapRef.current?.zoomIn()} onZoomOut={() => mapRef.current?.zoomOut()} onReset={() => mapRef.current?.reset()} onToggleTheme={toggleTheme} onExport={onExport} />

      {hover && <MapTooltip hover={hover} metric={metric} size={size} />}

      <JurisdictionPanel
        code={selected}
        tab={tab}
        onTab={(t) => patch({ tab: t === "rates" ? null : t })}
        onClose={() => patch({ sel: null, tab: null })}
        onDrill={enterScope}
        onSelectChild={(code) => patch({ sel: code, tab: null })}
        registry={registry}
      />

      <div className="mp-foot" aria-label="Map status">
        <span>Geometry {drill ? `Natural Earth 1:10m admin-1${manifest?.source.version ? ` (${manifest.source.version})` : ""}` : "Natural Earth 1:110m"}</span>
        <span>
          Projection <span className="mono">Mercator</span>
        </span>
        <span>
          <span>last crawl</span> <span className="n">{lastCrawl}</span>
        </span>
        <span>Reference data — verify against primary authority</span>
      </div>
    </div>
  );
}

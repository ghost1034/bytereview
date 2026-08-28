import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/taxatlas-ui/lib/navigation";
import { X } from "lucide-react";
import { api } from "@/taxatlas-ui/lib/api";
import { pluralLevel, type DrillLayer } from "@/taxatlas-ui/lib/geo";
import { fmtDate, fmtInt, fmtRate, titleCase } from "@/taxatlas-ui/lib/format";
import { TARIFF_MEASURE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import type { ChangeHistogram, CourtDecisionOut, RegulationOut, TariffOut } from "@/taxatlas-ui/lib/types";
import { Drawer } from "@/taxatlas-ui/components/ui/Drawer";
import { Tabs } from "@/taxatlas-ui/components/ui/Tabs";
import { SignificanceMark, StatusMark } from "@/taxatlas-ui/components/ui/Marker";
import { SourceLink } from "@/taxatlas-ui/components/ui/Chips";
import { ErrorState } from "@/taxatlas-ui/components/ui/EmptyState";
import { Bilingual, BilingualTitle, EnLine } from "@/taxatlas-ui/components/ui/Bilingual";
import { errorMessage } from "@/taxatlas-ui/components/ui/Toast";
import { RatesByType } from "@/taxatlas-ui/components/RatesTable";
import { ChangeRow } from "@/taxatlas-ui/components/ChangeRow";

import type { PanelTab } from "./panelTabs";

interface Props {
  code: string | null;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  onDrill: (parent: string) => void;
  onSelectChild: (code: string) => void;
  /** Drillable countries (lib/geo.ts buildDrillRegistry): API children/metrics merged with geometry availability. */
  registry: Record<string, DrillLayer>;
}

/** Slide-over for a clicked jurisdiction. Content = /jurisdictions/{code}/summary: serif title plate, codes line,
 *  authority link, summary prose, stat strip (with a 30-day change sparkline), tabs. Rates and change rows are
 *  the shared components (WP-C); the wrapper and record rows are map-owned. */
export function JurisdictionPanel({ code, tab, onTab, onClose, onDrill, onSelectChild, registry }: Props) {
  const q = useQuery({ queryKey: ["summary", code], queryFn: () => api.jurisdictions.summary(code!), enabled: !!code });
  const s = q.data;
  const j = s?.jurisdiction;
  const layer = j ? registry[j.code] : undefined;
  // Drill when the country has children in the database and a geometry file; otherwise list the children.
  const drillable = !!j && j.children_count > 0 && !!layer?.geometry;
  const listChildren = !!j && j.children_count > 0 && !drillable;
  // `rates_count` counts every descendant's rows (US = 254); the Rates tab renders the jurisdiction's own current
  // rows from `rates_by_type` (US = 9), so the tab pill must count what the tab shows.
  const ownRates = s ? Object.values(s.rates_by_type).reduce((n, rows) => n + rows.length, 0) : 0;
  const descendantNoun = layer ? pluralLevel(layer.level) : "sub-national";
  const effectiveTab: PanelTab = tab === "children" && !listChildren ? "rates" : tab;

  return (
    <Drawer mode="overlay" open={!!code} onClose={onClose} ariaLabel={j ? j.name : (code ?? "Jurisdiction")} closeOnEscape={false} chrome={false} initialFocus="panel" className="mp-panel">
      <div className="mp-drawer-head">
        <div className="row">
          <div>
            <h2 className="mp-drawer-title">{j ? <BilingualTitle original={j.name} /> : code}</h2>
            {j && (
              <div className="mp-drawer-sub">
                <span className="code">{[j.code, j.iso_alpha3, j.iso_numeric].filter(Boolean).join(" · ")}</span>
                <span>{[titleCase(j.level), j.region, j.currency].filter(Boolean).join(" · ")}</span>
                {j.parent_code && (
                  <button type="button" className="up" onClick={() => onSelectChild(j.parent_code!)} title={`Up to ${j.parent_code}`}>
                    ↑ {j.parent_code}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="actions">
            {j && <WatchButton code={j.code} />}
            {j && (
              <Link to={`/jurisdictions/${j.code}`} className="mp-btn" title="Open the full jurisdiction page">
                Open full page ↗
              </Link>
            )}
            <button type="button" className="mp-btn icon" onClick={onClose} aria-label="Close" title="Close (Esc)">
              <X />
            </button>
          </div>
        </div>
        {j?.tax_authority_url && (
          <div className="mp-drawer-sub bi" style={{ marginTop: 8 }}>
            <a href={j.tax_authority_url} target="_blank" rel="noreferrer" dir="auto">
              {j.tax_authority_name ?? j.tax_authority_url}
            </a>
            {/* English rendering of a non-English authority name (e.g. 総務省 → Ministry of Internal Affairs and Communications). */}
            {j.tax_authority_name && j.tax_authority_name_en && j.tax_authority_name_en.trim().toLocaleLowerCase() !== j.tax_authority_name.trim().toLocaleLowerCase() && <EnLine text={j.tax_authority_name_en} />}
          </div>
        )}
      </div>

      <div className="mp-drawer-body">
        {q.isLoading && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }} aria-busy="true">
            <div className="mp-skel" style={{ width: "60%" }} />
            <div className="mp-skel" style={{ width: "90%" }} />
            <div className="mp-skel" style={{ width: "75%" }} />
          </div>
        )}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {s && j && (
          <>
            {j.summary && <p className="mp-summary">{j.summary}</p>}
            <div className="mp-strip">
              <div title={j.children_count > 0 ? `Current rates of ${j.name} and its ${j.children_count} sub-jurisdictions` : undefined}>
                <div className="k">Rates</div>
                <div className="v">
                  {fmtInt(j.rates_count)}
                  {j.children_count > 0 && <span className="q">incl. {descendantNoun}</span>}
                </div>
              </div>
              <div>
                <div className="k">Regulations</div>
                <div className="v">{fmtInt(j.regulations_count)}</div>
              </div>
              <div>
                <div className="k">Courts</div>
                <div className="v">{fmtInt(j.court_decisions_count)}</div>
              </div>
              <div>
                <div className="k">Tariffs</div>
                <div className="v">{fmtInt(j.tariffs_count)}</div>
              </div>
              <div>
                <div className="k">Δ 30 d</div>
                <div className="v">
                  {fmtInt(j.changes_30d)}
                  <Sparkline code={j.code} />
                </div>
              </div>
            </div>

            {drillable && (
              <div className="mp-drill">
                <button type="button" className="mp-btn primary" onClick={() => onDrill(j.code)}>
                  Drill into {descendantNoun}
                </button>
                <span>
                  <span className="mp-mono">{j.children_count}</span> {layer && layer.metrics.length > 0 ? "sub-jurisdictions with own tax rates" : "sub-jurisdictions · geography only"}
                </span>
              </div>
            )}

            <Tabs<PanelTab>
              value={effectiveTab}
              onChange={onTab}
              tabs={[
                { key: "rates", label: "Rates", count: ownRates },
                { key: "regulations", label: "Regulations", count: s.recent_regulations.length },
                { key: "courts", label: "Courts", count: s.recent_court_decisions.length },
                { key: "tariffs", label: "Tariffs", count: s.recent_tariffs.length },
                { key: "changes", label: "Changes", count: s.recent_changes.length },
                ...(listChildren ? [{ key: "children" as PanelTab, label: j.level === "country" ? "Sub-national" : "Children", count: j.children_count }] : []),
              ]}
            />

            {effectiveTab === "rates" && <RatesByType grouped={s.rates_by_type} compact />}
            {effectiveTab === "regulations" && (s.recent_regulations.length === 0 ? <Empty what="regulations" /> : s.recent_regulations.map((r) => <RegRow key={r.id} r={r} />))}
            {effectiveTab === "courts" && (s.recent_court_decisions.length === 0 ? <Empty what="court decisions" /> : s.recent_court_decisions.map((d) => <CourtRow key={d.id} d={d} />))}
            {effectiveTab === "tariffs" && (s.recent_tariffs.length === 0 ? <Empty what="tariff measures" /> : s.recent_tariffs.map((t) => <TariffRow key={t.id} t={t} />))}
            {effectiveTab === "changes" && (s.recent_changes.length === 0 ? <Empty what="changes" /> : s.recent_changes.map((c) => <ChangeRow key={c.id} c={c} compact />))}
            {effectiveTab === "children" && <ChildrenList code={j.code} onSelect={onSelectChild} />}
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ---------------------------------------------------------------------------------------------------------- */

function Empty({ what }: { what: string }) {
  return <div className="mp-empty">No {what} recorded for this jurisdiction.</div>;
}


function RegRow({ r }: { r: RegulationOut }) {
  return (
    <div className="mp-row">
      <div className="meta">
        <span className="mono">{fmtDate(r.published_date)}</span>
        <StatusMark value={r.status} />
        <span>{titleCase(r.doc_type)}</span>
        {r.reference && <span className="mono">{r.reference}</span>}
      </div>
      <div className="t">
        <Bilingual original={r.title} lang={r.lang} translation={r.title_en} table />
      </div>
      {r.summary && <div className="s clamp">{r.summary}</div>}
      <div className="s">
        {r.authority && <span>{r.authority} · </span>}
        <SourceLink href={r.source_url} />
      </div>
    </div>
  );
}

function CourtRow({ d }: { d: CourtDecisionOut }) {
  return (
    <div className="mp-row">
      <div className="meta">
        <span className="mono">{fmtDate(d.decision_date)}</span>
        <SignificanceMark level={d.significance} />
        <StatusMark value={d.outcome} />
        {d.docket && <span className="mono">{d.docket}</span>}
      </div>
      <div className="t">
        <Bilingual original={d.case_name} lang={d.lang} translation={d.case_name_en} table />
      </div>
      <div className="s">
        {d.court}
        {d.citation && <span className="mp-mono"> · {d.citation}</span>}
      </div>
      {d.holding && <div className="hold">{d.holding}</div>}
    </div>
  );
}

function TariffRow({ t }: { t: TariffOut }) {
  return (
    <div className="mp-row">
      <div className="meta">
        <span className="mono">{fmtDate(t.effective_from)}</span>
        <StatusMark value={t.status} />
        <span>{label(TARIFF_MEASURE_LABEL, t.measure_type)}</span>
        {t.hs_code && <span className="mono">HS {t.hs_code}</span>}
      </div>
      <div className="t" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <Bilingual original={t.product_description} lang={t.lang} translation={t.product_description_en} table />
        </span>
        <span className="val">{t.rate != null ? fmtRate(t.rate) : (t.rate_text ?? "")}</span>
      </div>
      <div className="s">Partner: {t.partner_jurisdiction?.name ?? t.partner_scope ?? "All"}</div>
    </div>
  );
}

function ChildrenList({ code, onSelect }: { code: string; onSelect: (code: string) => void }) {
  const q = useQuery({ queryKey: ["children", code], queryFn: () => api.jurisdictions.children(code) });
  if (q.isLoading)
    return (
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="mp-skel" style={{ width: "80%" }} />
        <div className="mp-skel" style={{ width: "55%" }} />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <Empty what="sub-jurisdictions" />;
  return (
    <div>
      {q.data.map((c) => (
        <button key={c.id} type="button" className="mp-row" onClick={() => onSelect(c.code)} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="mp-mono" style={{ width: 60, flex: "none", fontSize: "var(--text-xs)" }}>
            {c.code}
          </span>
          <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--text-sm)" }}>{c.name}</span>
          <span className="s" style={{ margin: 0 }}>
            {titleCase(c.level)}
          </span>
          <span aria-hidden="true" style={{ color: "var(--ink-3)" }}>
            →
          </span>
        </button>
      ))}
    </div>
  );
}

/** 72×20 static sparkline of the last 30 days of change events for this jurisdiction (incl. children). */
function Sparkline({ code }: { code: string }) {
  const q = useQuery<ChangeHistogram>({
    queryKey: ["histogram", code, 30],
    queryFn: () => api.changes.histogram({ days: 30, jurisdiction: code, include_children: true }),
    staleTime: 5 * 60_000,
  });
  const d = q.data;
  const path = useMemo(() => {
    if (!d || d.days.length < 2) return null;
    const W = 44;
    const H = 16;
    const max = Math.max(1, ...d.days.map((x) => x.count));
    const pts = d.days.map((x, i) => [(i / (d.days.length - 1)) * W, H - 1 - (x.count / max) * (H - 2)] as const);
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L${W} ${H} L0 ${H} Z`;
    const counts = d.days.map((x) => x.count);
    return { line, area, title: `30 d: min ${Math.min(...counts)} · max ${Math.max(...counts)} · last ${counts[counts.length - 1]}` };
  }, [d]);
  if (!path) return null;
  return (
    <svg className="mp-spark" viewBox="0 0 44 16" aria-hidden="true">
      <title>{path.title}</title>
      <path className="area" d={path.area} />
      <path className="line" d={path.line} />
    </svg>
  );
}

/** Watch / Unwatch this jurisdiction (all tax types). Primary only while not yet watched (pages/map.md). */
function WatchButton({ code }: { code: string }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["watchlist"], queryFn: api.account.watchlist, staleTime: 60_000 });
  const item = list.data?.find((w) => w.jurisdiction_code === code && !w.tax_type);
  const add = useMutation({
    mutationFn: () => api.account.addWatch({ jurisdiction_code: code, include_children: true }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.account.removeWatch(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
  const busy = add.isPending || remove.isPending || list.isLoading;
  const err = add.error ?? remove.error;
  return (
    <button
      type="button"
      className={item ? "mp-btn" : "mp-btn default"}
      disabled={busy}
      aria-pressed={!!item}
      onClick={() => (item ? remove.mutate(item.id) : add.mutate())}
      title={err ? errorMessage(err) : item ? "Stop watching this jurisdiction" : "Notify me of changes in this jurisdiction"}
    >
      {item ? "Watching" : "Watch"}
    </button>
  );
}

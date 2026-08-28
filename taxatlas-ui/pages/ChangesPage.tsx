import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/taxatlas-ui/lib/navigation";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO, subDays } from "date-fns";
import { api, ApiError } from "@/taxatlas-ui/lib/api";
import { fmtInt } from "@/taxatlas-ui/lib/format";
import { CHANGE_TYPES, CHANGE_TYPE_LABEL, ENTITY_LABEL, ENTITY_TYPES, TAX_TYPES, TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import type { ChangeEventOut } from "@/taxatlas-ui/lib/types";
import { useSearchFilters } from "@/taxatlas-ui/hooks/useSearchFilters";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { PushLayout } from "@/taxatlas-ui/components/detail/DetailPanel";
import { ChipDate, ChipInput, ChipSelect, FilterRow, ResultSentence } from "@/taxatlas-ui/components/detail/FilterChips";
import { TableFoot, TableRegion, downloadCsv, useClampOffset } from "@/taxatlas-ui/components/detail/DataTable";
import { WatchButton } from "@/taxatlas-ui/components/detail/WatchButton";
import { ChangeRow } from "@/taxatlas-ui/components/ChangeRow";
import { RegulationDrawer } from "@/taxatlas-ui/components/drawers/RegulationDrawer";
import { CourtDecisionDrawer } from "@/taxatlas-ui/components/drawers/CourtDecisionDrawer";
import { TariffDrawer } from "@/taxatlas-ui/components/drawers/TariffDrawer";
import "@/taxatlas-ui/components/detail/lists.css";

const KEYS = ["jurisdiction", "tax_type", "entity_type", "change_type", "since", "source_id"] as const;
type Open = { kind: "regulation" | "court_decision" | "tariff"; id: number } | null;

function dayLabel(iso: string): string {
  const d = iso.slice(0, 10);
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  return d === today ? "Today" : d === yesterday ? "Yesterday" : d;
}

export default function ChangesPage() {
  usePageTitle("Changes");
  const nav = useNavigate();
  const { filters, limit, offset, set, reset, active } = useSearchFilters(KEYS, 50);
  const [auto, setAuto] = useState(true);
  const [open, setOpen] = useState<Open>(null);
  // `since` comes from the URL: an unparseable value (e.g. ?since=abc) must not throw in render; drop it instead.
  const sinceValid = !!filters.since && !Number.isNaN(new Date(filters.since).getTime());
  const sinceIso = sinceValid ? new Date(filters.since).toISOString() : "";
  useEffect(() => {
    if (filters.since && !sinceValid) set({ since: null });
  }, [filters.since, sinceValid, set]);

  const query = useQuery({
    queryKey: ["changes", filters, limit, offset],
    queryFn: () => api.changes.list({ ...filters, since: sinceIso, limit, offset }),
    placeholderData: keepPreviousData,
    refetchInterval: auto ? 30_000 : false,
  });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const goOffset = useCallback((o: number) => set({ offset: o }), [set]);
  useClampOffset(query.data?.total, offset, limit, goOffset);

  // Mark rows that arrived since the previous fetch (brass rule that fades — the only ambient animation).
  const seen = useRef<Set<number> | null>(null);
  const fresh = useMemo(() => {
    const prev = seen.current;
    const now = new Set(items.map((c) => c.id));
    const out = new Set<number>();
    if (prev && offset === 0) items.forEach((c) => !prev.has(c.id) && out.add(c.id));
    seen.current = now;
    return out;
  }, [items, offset]);

  // Histogram over the filtered population (server-side): same filters as the feed.
  const histScope = { days: 30, jurisdiction: filters.jurisdiction, tax_type: filters.tax_type, entity_type: filters.entity_type, change_type: filters.change_type, source_id: filters.source_id, since: sinceIso };
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => api.sources.list(), staleTime: 300_000 });
  const slugById = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s.slug])), [sources.data]);
  const serverHist = useQuery({ queryKey: ["changes-histogram", histScope], queryFn: () => api.changes.histogram(histScope), retry: false, staleTime: 60_000, refetchInterval: auto ? 60_000 : false });
  const serverUnavailable = serverHist.isError && serverHist.error instanceof ApiError && serverHist.error.status === 404;
  const histogram = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => format(subDays(new Date(), 29 - i), "yyyy-MM-dd"));
    const counts = new Map(days.map((d) => [d, 0]));
    if (serverHist.data) serverHist.data.days.forEach((d) => counts.has(d.date.slice(0, 10)) && counts.set(d.date.slice(0, 10), d.count));
    else items.forEach((c) => {
      const d = format(parseISO(c.detected_at), "yyyy-MM-dd");
      if (counts.has(d)) counts.set(d, (counts.get(d) ?? 0) + 1);
    });
    return days.map((d) => ({ day: d, label: d.slice(5), count: counts.get(d) ?? 0 }));
  }, [items, serverHist.data]);
  const histTotal = histogram.reduce((a, b) => a + b.count, 0);

  // "By entity": five count queries with the same filters (limit=1 → total only).
  const byEntity = useQueries({
    queries: ENTITY_TYPES.map((et) => ({
      queryKey: ["changes-count", { ...filters, since: sinceIso, entity_type: et }],
      queryFn: () => api.changes.list({ ...filters, entity_type: et, since: sinceIso, limit: 1 }),
      staleTime: 60_000,
      enabled: !filters.entity_type || filters.entity_type === et,
    })),
  });

  const onOpen = useCallback(
    (c: ChangeEventOut) => {
      if (c.entity_type === "regulation" || c.entity_type === "court_decision" || c.entity_type === "tariff") setOpen({ kind: c.entity_type, id: c.entity_id });
      else if (c.jurisdiction) nav(`/jurisdictions/${encodeURIComponent(c.jurisdiction.code)}${c.entity_type === "rate" ? "?tab=rates" : ""}`);
    },
    [nav],
  );
  const close = useCallback(() => setOpen(null), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "[" && offset > 0) set({ offset: Math.max(0, offset - limit) });
      if (e.key === "]" && query.data && offset + limit < query.data.total) set({ offset: offset + limit });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offset, limit, set, query.data]);

  const groups = useMemo(() => {
    const out: Array<{ label: string; rows: ChangeEventOut[] }> = [];
    items.forEach((c) => {
      const l = dayLabel(c.detected_at);
      const last = out[out.length - 1];
      if (last && last.label === l) last.rows.push(c);
      else out.push({ label: l, rows: [c] });
    });
    return out;
  }, [items]);

  const exportCsv = () =>
    downloadCsv(
      "changes.csv",
      ["id", "detected_at", "change_type", "entity_type", "entity_id", "jurisdiction", "tax_type", "title", "title_en", "old_value", "new_value"],
      items.map((c) => [c.id, c.detected_at, c.change_type, c.entity_type, c.entity_id, c.jurisdiction?.code, c.tax_type, c.title, c.title_en ?? "", JSON.stringify(c.old_value), JSON.stringify(c.new_value)]),
    );

  const panel =
    open?.kind === "regulation" ? <RegulationDrawer id={open.id} onClose={close} /> : open?.kind === "court_decision" ? <CourtDecisionDrawer id={open.id} onClose={close} /> : open?.kind === "tariff" ? <TariffDrawer id={open.id} onClose={close} /> : null;

  return (
    <PushLayout panel={panel}>
      <div className="ta-head">
        <div>
          <h1>Change feed</h1>
          <div className="sub">Detected rate, regulation, court and tariff changes · a ledger, newest first</div>
        </div>
        <div className="ta-actions">
          <label className={auto ? "ta-toggle on" : "ta-toggle"} title="Refetch silently every 30 s">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} aria-label="Auto-refresh every 30 seconds" />
            <i aria-hidden="true" />
            Auto-refresh <span className="mono">30 s</span>
          </label>
          <button type="button" className="btn" onClick={exportCsv} disabled={items.length === 0} title="CSV of the events on this page, with the current filters applied">Export CSV</button>
          {filters.jurisdiction ? <WatchButton code={filters.jurisdiction} taxType={filters.tax_type || null} long /> : <button type="button" className="btn btn-ghost" disabled title="Add a Jurisdiction filter to watch this view">Watch this view</button>}
        </div>
      </div>

      <FilterRow>
        <ChipInput label="Jurisdiction" value={filters.jurisdiction} onChange={(v) => set({ jurisdiction: v })} placeholder="e.g. DE" code />
        <ChipSelect label="Tax type" value={filters.tax_type} onChange={(v) => set({ tax_type: v })} options={TAX_TYPES.map((t) => ({ value: t, label: TAX_TYPE_LABEL[t] }))} />
        <ChipSelect label="Entity" value={filters.entity_type} onChange={(v) => set({ entity_type: v })} options={ENTITY_TYPES.map((e) => ({ value: e, label: ENTITY_LABEL[e] }))} />
        <ChipSelect label="Change type" value={filters.change_type} onChange={(v) => set({ change_type: v })} options={CHANGE_TYPES.map((c) => ({ value: c, label: CHANGE_TYPE_LABEL[c] }))} />
        <ChipDate label="Since" value={filters.since} onChange={(v) => set({ since: v })} />
        <ChipSelect label="Source" value={filters.source_id} onChange={(v) => set({ source_id: v })} mono options={(sources.data ?? []).map((s) => ({ value: String(s.id), label: s.slug }))} />
        <ResultSentence shown={query.data?.total} total={undefined} active={active} onReset={reset} />
      </FilterRow>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 14, alignItems: "start" }}>
        <TableRegion>
          <div className={query.isFetching && query.data ? "ta-tblwrap dim" : "ta-tblwrap"} style={{ maxHeight: "calc(100vh - 250px)" }}>
            {query.isLoading ? (
              <div className="ta-feed" aria-hidden="true" style={{ padding: 12, gap: 14 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <span key={i} className="ta-sk" style={{ width: `${[60, 35, 80, 45, 55, 40, 70, 30][i]}%`, display: "block" }} />
                ))}
              </div>
            ) : query.isError ? (
              <div className="ta-empty" style={{ padding: "60px 12px", textAlign: "center" }}>
                Could not load changes ({(query.error as { status?: number }).status ?? "network"}). <button type="button" className="btn btn-sm" onClick={() => query.refetch()}>Retry</button>
              </div>
            ) : items.length === 0 ? (
              <div className="ta-empty" style={{ padding: "60px 12px", textAlign: "center" }}>
                No changes detected{active ? " for these filters" : ""}.{active > 0 && <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }} onClick={reset}>Clear filters</button>}
              </div>
            ) : (
              <div className="ta-feed">
                {groups.map((g) => (
                  <div key={g.label}>
                    <div className="ta-daterule">{g.label === "Today" || g.label === "Yesterday" ? g.label : <span className="mono">{g.label}</span>}</div>
                    {g.rows.map((c) => (
                      <ChangeRow key={c.id} c={c} onOpen={onOpen} fresh={fresh.has(c.id)} sourceSlug={c.source_id != null ? slugById.get(c.source_id) : null} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          {query.data && <TableFoot total={query.data.total} limit={limit} offset={offset} onOffset={(o) => set({ offset: o })} />}
        </TableRegion>

        <aside className="ta-side-region" aria-label="Change statistics">
          <div className="ta-hist-head">
            <span className="ta-caps">Changes per day · last 30d</span>
            <b>{fmtInt(histTotal)}</b>
          </div>
          <div style={{ height: 140, padding: "0 8px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 6, right: 4, left: -4, bottom: 0 }} barCategoryGap={1}>
                <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: "var(--ink-3)", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={{ stroke: "var(--hairline-strong)" }} interval={6} />
                <YAxis tick={{ fontSize: 9.5, fill: "var(--ink-3)", fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--hairline-strong)", borderRadius: 3, fontSize: 11, fontFamily: "var(--font-mono)", padding: "4px 8px" }} labelStyle={{ color: "var(--ink-2)" }} itemStyle={{ color: "var(--ink-1)" }} formatter={(v: number) => [v, "changes"]} />
                <Bar dataKey="count" name="changes" fill="var(--accent)" radius={0} isAnimationActive={false} onClick={(d: unknown) => { const row = d as { day?: string }; if (row.day) set({ since: row.day }); }} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="ta-prov" style={{ padding: "6px 12px 10px" }}>
            {serverHist.data
              ? `Server aggregate over ${active ? "the filtered population" : "all events"}. Click a bar to set Since.`
              : serverUnavailable
                ? `Aggregate endpoint unavailable; counting the ${items.length} events on this page instead.`
                : serverHist.isError
                  ? `Aggregate failed (${(serverHist.error as Error).message}); showing this page only.`
                  : "Loading aggregate…"}
          </div>
          <div className="ta-hist-head" style={{ borderTop: "1px solid var(--hairline)" }}>
            <span className="ta-caps">By entity</span>
          </div>
          <div className="ta-byent">
            {ENTITY_TYPES.map((et, i) => {
              const n = filters.entity_type && filters.entity_type !== et ? 0 : byEntity[i].data?.total;
              return (
                <Fragment key={et}>
                  <span>{label(ENTITY_LABEL, et)}s</span>
                  <span className={n === 0 ? "zero" : undefined}>{n == null ? "…" : fmtInt(n)}</span>
                </Fragment>
              );
            })}
          </div>
          <div className="ta-hist-head" style={{ borderTop: "1px solid var(--hairline)" }}>
            <span className="ta-caps">Page size</span>
            <span className="rows ta-faint" style={{ position: "relative", display: "inline-flex", gap: 4, fontSize: "var(--text-xs)" }}>
              Rows <b>{limit}</b> ▾
              <select aria-label="Rows per page" value={String(limit)} onChange={(e) => set({ limit: e.target.value, offset: 0 })} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", cursor: "pointer" }}>
                {[50, 100, 200, 500].map((n) => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </span>
          </div>
        </aside>
      </div>
    </PushLayout>
  );
}

/* Sources — crawler monitoring (pages/sources.md). Operational, honest, terse. Admin-only actions are shown only to admins.
   Table 1: registered sources (second line: slug · host, or the last error in --negative); table 2: recent runs. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { useAuth } from "@/taxatlas-ui/lib/auth";
import { fmtDateTime, fmtInt } from "@/taxatlas-ui/lib/format";
import { CRAWL_STATUSES, SOURCE_CATEGORIES, label } from "@/taxatlas-ui/lib/enums";
import type { CrawlRunOut, SourceOut } from "@/taxatlas-ui/lib/types";
import { useSearchFilters } from "@/taxatlas-ui/hooks/useSearchFilters";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { useSourceSchedules } from '@/taxatlas-ui/hooks/useSourceSchedules';
import { formatScheduleTime, nextCrawlBatch, scheduleForSource, sourceScheduleLabel } from '@/taxatlas-ui/lib/schedules';
import { useToast } from "@/taxatlas-ui/components/ui/Toast";
import { PushLayout } from "@/taxatlas-ui/components/detail/DetailPanel";
import { ChipInput, ChipSelect, FilterRow, ResultSentence, SearchChip } from "@/taxatlas-ui/components/detail/FilterChips";
import { ErrorRow, MessageRow, SkeletonRows, TableFoot, TableRegion, Th, Toolbar, useClampOffset, useListKeys, useTableSettings, type ColumnDef } from "@/taxatlas-ui/components/detail/DataTable";
import { StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef } from "@/taxatlas-ui/components/detail/JRef";
import { SparkBars } from "@/taxatlas-ui/components/detail/Sparkline";
import { SourceDrawer } from "@/taxatlas-ui/components/drawers/SourceDrawer";
import { EnLine } from "@/taxatlas-ui/components/ui/Bilingual";

const KEYS = ["category", "run_status", "source_id", "q", "jurisdiction", "health"] as const;
const COLUMNS: ColumnDef[] = [
  { key: "source", label: "Source · authority", fixed: true },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "category", label: "Category" },
  { key: "adapter", label: "Adapter" },
  { key: "schedule", label: "Schedule" },
  { key: "last_run", label: "Last run" },
  { key: "status", label: "Status", fixed: true },
  { key: "items", label: "Items", num: true },
  { key: "fails", label: "Fails", num: true },
  { key: "spark", label: "Items per run" },
];

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** True while the viewport matches `query`; re-evaluated on resize. */
function useMatchMedia(query: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : true));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export default function SourcesPage() {
  usePageTitle("Sources");
  const { isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { filters, limit, offset, set, reset, active } = useSearchFilters(KEYS, 25);
  const settings = useTableSettings("sources", COLUMNS);
  // Below 1280px the 12-column admin table overflows its region (Enabled header clipped, Run column off-screen):
  // Adapter (also in the drawer) and the items-per-run sparkline yield first.
  const wide = useMatchMedia("(min-width: 1280px)");
  const show = useCallback((key: string) => settings.show(key) && (wide || (key !== "adapter" && key !== "spark")), [settings, wide]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const sources = useQuery({ queryKey: ["sources", filters.category], queryFn: () => api.sources.list({ category: filters.category }), refetchInterval: 15_000 });
  const schedules = useSourceSchedules();
  const scheduleData = schedules.isError ? undefined : schedules.data;
  const runs = useQuery({
    queryKey: ["source-runs", filters.run_status, filters.source_id, limit, offset],
    queryFn: () => api.sources.runs({ status: filters.run_status, source_id: filters.source_id, limit, offset }),
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });
  const history = useQuery({ queryKey: ["source-runs", "history"], queryFn: () => api.sources.runs({ limit: 500 }), refetchInterval: 60_000, staleTime: 30_000 });
  const goOffset = useCallback((o: number) => set({ offset: o }), [set]);
  useClampOffset(runs.data?.total, offset, limit, goOffset);
  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["sources"] });
    qc.invalidateQueries({ queryKey: ["source-runs"] });
    qc.invalidateQueries({ queryKey: ['source-schedules'] });
  }, [qc]);

  const crawl = useMutation({
    mutationFn: (id: number) => api.sources.crawl(id),
    onMutate: (id) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: (m) => {
      toast.success("Crawl queued", m.detail);
      window.setTimeout(invalidate, 1500);
    },
    onError: (e) => toast.error(e),
  });
  const crawlAll = useMutation({
    mutationFn: () => api.sources.crawlAll(),
    onSuccess: (m) => {
      toast.success("Crawl queued", m.detail);
      window.setTimeout(invalidate, 1500);
    },
    onError: (e) => toast.error(e),
  });
  const toggle = useMutation({ mutationFn: (id: number) => api.sources.toggle(id), onSuccess: () => invalidate(), onError: (e) => toast.error(e) });

  const all = useMemo(() => sources.data ?? [], [sources.data]);
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all]);
  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const jur = filters.jurisdiction.trim().toUpperCase();
    return all.filter((s) => {
      if (q && !(s.name.toLowerCase().includes(q) || s.slug.includes(q) || (s.authority ?? "").toLowerCase().includes(q))) return false;
      if (jur && s.jurisdiction?.code.toUpperCase() !== jur) return false;
      if (filters.health === "failing" && s.consecutive_failures === 0) return false;
      if (filters.health === "disabled" && s.enabled) return false;
      if (filters.health === "enabled" && !s.enabled) return false;
      return true;
    });
  }, [all, filters.q, filters.jurisdiction, filters.health]);
  const sparks = useMemo(() => {
    const m = new Map<number, number[]>();
    (history.data?.items ?? []).forEach((r) => {
      const arr = m.get(r.source_id) ?? [];
      if (arr.length < 14) arr.unshift(r.items_found);
      m.set(r.source_id, arr);
    });
    return m;
  }, [history.data]);
  const enabled = all.filter((s) => s.enabled).length;
  const failing = all.filter((s) => s.consecutive_failures > 0).length;
  const next = nextCrawlBatch(scheduleData);

  const ids = useMemo(() => visible.map((s) => s.id), [visible]);
  useListKeys({ ids, selected: openId, onSelect: setOpenId, onClose: () => setOpenId(null) });
  const cols = settings.visible.filter((c) => show(c.key)).length + 1 + (isAdmin ? 1 : 0);
  const openSource = openId != null ? byId.get(openId) ?? null : null;

  return (
    <PushLayout panel={<SourceDrawer source={openSource} onClose={() => setOpenId(null)} isAdmin={isAdmin} onToggle={(s) => toggle.mutate(s.id)} onCrawl={(s) => crawl.mutate(s.id)} busy={busyId === openId} />}>
      <div className="ta-head">
        <div>
          <h1>Sources & monitoring</h1>
          <div className="sub">
            {sources.data ? (
              <>
                <span className="num">{all.length}</span> sources · <span className="num">{enabled}</span> enabled
                {failing > 0 && <> · <span className="num" style={{ color: "var(--negative)" }}>{failing}</span> failing</>}
                {next && <> · next scheduled batch <span className="num">{formatScheduleTime(next)}</span></>}
                {scheduleData?.mode === 'manual' && <> · manual runs only</>}
                {schedules.isError && <> · schedule unavailable <button type="button" className="ta-link-btn" onClick={() => schedules.refetch()}>Retry</button></>}
                <span className="ta-faint"> · auto-refresh 15 s</span>
              </>
            ) : (
              "Registered crawler sources and their recent runs"
            )}
          </div>
        </div>
        <div className="ta-actions">
          <button type="button" className="btn btn-ghost" onClick={invalidate} title="Refresh now">Refresh</button>
          {isAdmin && (
            <button type="button" className="btn" aria-busy={crawlAll.isPending || undefined} disabled={crawlAll.isPending} onClick={() => crawlAll.mutate()} title="Queue a crawl of every enabled source">
              Crawl all enabled
            </button>
          )}
        </div>
      </div>

      <FilterRow>
        <SearchChip value={filters.q} onCommit={(v) => set({ q: v })} placeholder="Name or slug…" width={240} />
        <ChipSelect label="Category" value={filters.category} onChange={(v) => set({ category: v })} options={SOURCE_CATEGORIES.map((c) => ({ value: c, label: label({}, c) }))} />
        <ChipInput label="Jurisdiction" value={filters.jurisdiction} onChange={(v) => set({ jurisdiction: v })} placeholder="e.g. DE" code />
        <div className="ta-seg" role="group" aria-label="Health">
          {(["", "enabled", "failing", "disabled"] as const).map((h) => (
            <button key={h || "all"} type="button" aria-pressed={filters.health === h} onClick={() => set({ health: h })}>
              {h === "" ? "All" : label({}, h)}
            </button>
          ))}
        </div>
        <ResultSentence shown={visible.length} total={all.length} active={active - (filters.run_status ? 1 : 0) - (filters.source_id ? 1 : 0)} onReset={reset} noun="sources" />
      </FilterRow>

      <TableRegion>
        <Toolbar sortLabel={<b>category, name</b>} settings={settings} />
        <div className="ta-tblwrap" style={{ maxHeight: "52vh" }}>
          <table className={`tbl lt ${settings.density}`} aria-label="Registered sources">
            <thead>
              <tr>
                <Th>Source · authority</Th>
                <Th width={60} hidden={!show("jurisdiction")}>Juris</Th>
                <Th width={86} hidden={!show("category")}>Category</Th>
                <Th width={70} hidden={!show("adapter")}>Adapter</Th>
                <Th width={166} hidden={!show("schedule")}>Batch schedule</Th>
                <Th width={124} hidden={!show("last_run")}>Last run</Th>
                <Th width={110}>Status</Th>
                <Th width={70} num hidden={!show("items")}>Items</Th>
                <Th width={60} num hidden={!show("fails")}>Fails</Th>
                <Th width={64} hidden={!show("spark")}><span title="Items per run, last 14 runs">⌇</span></Th>
                <Th width={60}>Enabled</Th>
                {isAdmin && <Th width={90}><span className="sr-only">Actions</span></Th>}
              </tr>
            </thead>
            <tbody>
              {sources.isLoading ? (
                <SkeletonRows cols={cols} rows={6} />
              ) : sources.isError ? (
                <ErrorRow cols={cols} error={sources.error} noun="sources" onRetry={() => sources.refetch()} />
              ) : visible.length === 0 ? (
                <MessageRow cols={cols}>{all.length === 0 ? "No sources registered." : "No sources match these filters."}{active > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Clear filters</button>}</MessageRow>
              ) : (
                visible.map((s) => {
                  const running = s.last_status === "running" || busyId === s.id;
                  const selectedForRuns = filters.source_id === String(s.id);
                  return (
                    <tr key={s.id} className="row-link" aria-selected={openId === s.id} onClick={() => setOpenId(s.id)}>
                      <td className="title" style={{ height: "auto", padding: "6px 12px" }}>
                        <button
                          type="button"
                          className="t"
                          style={{ all: "unset", cursor: "pointer", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", textDecoration: selectedForRuns ? "underline" : undefined, textDecorationColor: "var(--accent)" }}
                          title={`Filter runs to ${s.slug}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            set({ source_id: selectedForRuns ? "" : String(s.id) });
                          }}
                        >
                          <span dir="auto">{s.name}</span>
                        </button>
                        {s.last_error && s.consecutive_failures > 0 ? (
                          <span className="sub" style={{ color: "var(--negative)" }} title={s.last_error}>
                            {s.last_error}{s.consecutive_failures > 1 ? ` (${s.consecutive_failures} consecutive)` : ""}
                          </span>
                        ) : (
                          <>
                            <span className="sub">
                              <span className="mono">{s.slug}</span> · {host(s.url)}
                              {s.authority ? <> · <span dir="auto">{s.authority}</span></> : ""}
                            </span>
                            <EnLine text={s.authority_en} table className="sub bi-sub" />
                          </>
                        )}
                      </td>
                      {show("jurisdiction") && <td>{s.jurisdiction ? <JRef j={s.jurisdiction} nameless /> : <span className="ta-faint">Global</span>}</td>}
                      {show("category") && <td className="text">{label({}, s.category)}</td>}
                      {show("adapter") && <td className="code">{s.adapter}</td>}
                      {show("schedule") && <td className="text" title={scheduleData?.mode === 'cloud_run' ? scheduleForSource(s, scheduleData)?.schedule_cron : undefined}>{schedules.isLoading && s.enabled ? 'Loading…' : sourceScheduleLabel(s, scheduleData)}</td>}
                      {show("last_run") && <td className="date" title={s.last_success_at ? `last success ${fmtDateTime(s.last_success_at)}` : undefined}>{fmtDateTime(s.last_run_at)}</td>}
                      <td>
                        {!s.enabled ? <StatusMarker value="disabled" tone="neutral" /> : running ? <StatusMarker value="running" /> : <StatusMarker value={s.last_status ?? "pending"} text={s.last_status ?? "never run"} />}
                        {running && s.enabled && <span className="ta-runbar" aria-hidden="true" />}
                      </td>
                      {show("items") && <td className="rate num">{fmtInt(s.items_total)}</td>}
                      {show("fails") && <td className="rate num" style={s.consecutive_failures > 0 ? { color: "var(--negative)" } : { color: "var(--ink-3)" }}>{s.consecutive_failures}</td>}
                      {show("spark") && <td>{sparks.get(s.id)?.length ? <SparkBars values={sparks.get(s.id)!} /> : <span className="ta-faint">—</span>}</td>}
                      <td onClick={(e) => e.stopPropagation()}>
                        {isAdmin ? (
                          <label className={s.enabled ? "ta-toggle on" : "ta-toggle"} title={s.enabled ? "Disable source" : "Enable source"}>
                            <input
                              type="checkbox"
                              role="switch"
                              aria-checked={s.enabled}
                              checked={s.enabled}
                              aria-label={`${s.enabled ? "Disable" : "Enable"} source ${s.name}`}
                              disabled={toggle.isPending}
                              onChange={() => toggle.mutate(s.id)}
                            />
                            <i aria-hidden="true" />
                          </label>
                        ) : (
                          <span className="mono text-xs text-ink-3">{s.enabled ? "yes" : "no"}</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="act" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-ghost btn-sm" aria-busy={busyId === s.id || undefined} disabled={busyId === s.id || !s.enabled} aria-label={scheduleData?.mode === 'cloud_run' ? 'Run adapter batch now' : 'Crawl now'} title={s.enabled ? (scheduleData?.mode === 'cloud_run' ? 'Run all enabled sources in the same job now' : `Crawl ${s.slug} now`) : "Enable the source first"} onClick={() => crawl.mutate(s.id)}>
                            {scheduleData?.mode === 'cloud_run' ? 'Run batch' : 'Run'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </TableRegion>

      <TableRegion>
        <Toolbar
          left={
            <>
              <span className="result" style={{ color: "var(--ink-1)", fontSize: "var(--text-base)", fontWeight: 500 }}>Recent runs</span>
              <ChipSelect label="Run status" value={filters.run_status} onChange={(v) => set({ run_status: v })} options={CRAWL_STATUSES.map((s) => ({ value: s, label: s }))} />
              {filters.source_id && (
                <button type="button" className="ta-chip" onClick={() => set({ source_id: "" })} title="Show runs from every source">
                  <span className="lbl">Source</span>
                  <b className="code">{byId.get(Number(filters.source_id))?.slug ?? filters.source_id}</b>
                  <span className="x" aria-hidden="true"><svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" /></svg></span>
                  <span className="sr-only">clear source filter ({byId.get(Number(filters.source_id))?.slug ?? filters.source_id})</span>
                </button>
              )}
            </>
          }
          right={<span className="result">auto-refresh <b>15 s</b></span>}
        />
        <div className="ta-tblwrap" style={{ maxHeight: "40vh" }}>
          <table className={`tbl lt ${settings.density}`} aria-label="Recent crawl runs">
            <thead>
              <tr>
                <Th width={150}>Started</Th>
                <Th>Source</Th>
                <Th width={90}>Trigger</Th>
                <Th width={110}>Status</Th>
                <Th width={210}>Result</Th>
                <Th width={60} num>HTTP</Th>
                <Th width={70} num>Duration</Th>
                <Th width={220}>Error</Th>
              </tr>
            </thead>
            <tbody>
              {runs.isLoading ? (
                <SkeletonRows cols={8} rows={6} />
              ) : runs.isError ? (
                <ErrorRow cols={8} error={runs.error} noun="crawl runs" onRetry={() => runs.refetch()} />
              ) : runs.data && runs.data.items.length === 0 ? (
                <MessageRow cols={8}>No crawl runs yet. <span className="ta-faint">{isAdmin ? `Use ${scheduleData?.mode === 'cloud_run' ? 'Run batch' : 'Run'} or Crawl all enabled to trigger one.` : "Runs are recorded when the scheduler or an admin triggers a crawl."}</span></MessageRow>
              ) : (
                runs.data?.items.map((r) => <RunRow key={r.id} r={r} source={byId.get(r.source_id)} />)
              )}
            </tbody>
          </table>
        </div>
        {runs.data && <TableFoot total={runs.data.total} limit={limit} offset={offset} onOffset={(o) => set({ offset: o })} onLimit={(l) => set({ limit: l, offset: 0 })} />}
      </TableRegion>
      <div className="ta-prov">
        {scheduleData?.mode === 'cloud_run' ? 'Crawl batches run every 24 hours. Times shown are scheduled batch triggers in UTC; enabled sources run sequentially, so individual start times can be later. Run batch starts all enabled sources in the same job. Manual runs do not reset the daily schedule. Notification delivery runs every minute. ' : scheduleData?.mode === 'manual' ? 'Automatic scheduling is not active in this environment. Use Run or the CLI to start a crawl. ' : 'Batch schedules could not be confirmed. '}
        Sources are automatically disabled after 10 consecutive failures; an admin can re-enable them.
      </div>
    </PushLayout>
  );
}

/** `manual:user:<id>` / `manual:<email>` → "manual"; `scheduler` / `cli` pass through. Raw value stays in the tooltip. */
function triggeredByLabel(v: string): string {
  if (!v) return "—";
  const head = v.split(":")[0];
  return head === "manual" ? "manual" : head;
}

function RunRow({ r, source }: { r: CrawlRunOut; source?: SourceOut }) {
  const dur = r.finished_at ? Math.max(0, (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
  return (
    <tr>
      <td className="date">{fmtDateTime(r.started_at)}</td>
      <td className="title"><span className="t" title={source?.slug}>{source?.name ?? `#${r.source_id}`}</span></td>
      <td className="text" title={r.triggered_by}>{triggeredByLabel(r.triggered_by)}</td>
      <td><StatusMarker value={r.status} />{r.status === "running" && <span className="ta-runbar" aria-hidden="true" />}</td>
      <td className="code" style={{ fontSize: "var(--text-xs)" }}>
        fetched {r.items_found} · new <span style={r.items_new > 0 ? { color: "var(--ink-1)" } : undefined}>{r.items_new}</span> · changed <span style={r.items_changed > 0 ? { color: "var(--ink-1)" } : undefined}>{r.items_changed}</span>
      </td>
      <td className="code num">{r.http_status ?? "—"}</td>
      <td className="code num">{dur == null ? "…" : `${dur.toFixed(1)} s`}</td>
      <td className="err" title={r.error ?? undefined}>{r.error ?? ""}</td>
    </tr>
  );
}

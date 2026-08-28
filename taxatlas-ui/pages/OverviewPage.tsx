import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/taxatlas-ui/lib/navigation";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { api } from "@/taxatlas-ui/lib/api";
import { fmtDate, fmtInt } from "@/taxatlas-ui/lib/format";
import { TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import type { ChangeEventOut } from "@/taxatlas-ui/lib/types";
import { Page, PageHeader } from "@/taxatlas-ui/components/layout/Page";
import { Stat, StatStrip, Sparkline } from "@/taxatlas-ui/components/ui/StatStrip";
import { SkeletonBlock, TableSkeleton } from "@/taxatlas-ui/components/ui/Skeleton";
import { ErrorState } from "@/taxatlas-ui/components/ui/EmptyState";
import { CodeBlock } from "@/taxatlas-ui/components/ui/CodeBlock";
import { Button } from "@/taxatlas-ui/components/ui/Button";
import { ChangeRow } from "@/taxatlas-ui/components/ChangeRow";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";

const CHART_H = 180;

function utcStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${new Date(iso).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(day: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  return day === today ? "Today" : day === y ? "Yesterday" : day;
}

export default function OverviewPage() {
  usePageTitle("Overview");
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats.overview, refetchInterval: 60_000 });
  const h30 = useQuery({ queryKey: ["changes", "histogram", 30], queryFn: () => api.changes.histogram({ days: 30 }) });
  const h7 = useQuery({ queryKey: ["changes", "histogram", 7], queryFn: () => api.changes.histogram({ days: 7 }) });
  const runs = useQuery({ queryKey: ["sources", "runs", "overview"], queryFn: () => api.sources.runs({ limit: 200 }) });
  const [day, setDay] = useState<string | null>(null);
  const recent = useQuery({
    queryKey: ["changes", "recent", day],
    queryFn: () => api.changes.list(day ? { since: `${day}T00:00:00Z`, limit: 100 } : { limit: 10 }),
    select: (p) => (day ? p.items.filter((c) => dayKey(c.detected_at) === day).slice(0, 10) : p.items),
  });
  const s = stats.data;

  const crawlDays = useMemo(() => new Set((runs.data?.items ?? []).map((r) => dayKey(r.started_at))), [runs.data]);
  const perDay = useMemo(
    () => (h30.data?.days ?? []).map((d) => ({ date: d.date, count: d.count, gap: d.count === 0 && runs.data !== undefined && !crawlDays.has(d.date) })),
    [h30.data, crawlDays, runs.data],
  );
  const byType = useMemo(() => {
    const rows = Object.entries(s?.by_tax_type ?? {})
      .map(([k, v]) => ({ key: k, name: label(TAX_TYPE_LABEL, k), value: v }))
      .sort((a, b) => b.value - a.value);
    if (rows.length <= 10) return rows;
    const head = rows.slice(0, 10);
    const other = rows.slice(10).reduce((n, r) => n + r.value, 0);
    return [...head, { key: "__remaining__", name: "Remaining", value: other }];
  }, [s]);

  const freshInstall = s && s.sources === 0 && s.changes_30d === 0;
  const grouped = useMemo(() => groupByDay(recent.data ?? []), [recent.data]);

  return (
    <Page>
      <PageHeader
        title="Overview"
        actions={
          <span className="text-xs text-ink-3">
            Last crawl <span className="mono text-ink-2">{utcStamp(s?.last_crawl_at)}</span>
            {s && (
              <>
                {" "}
                · <span className="mono text-ink-2">{s.sources_enabled}/{s.sources}</span> ok
              </>
            )}
          </span>
        }
      />
      {stats.isError && <ErrorState error={stats.error} onRetry={() => stats.refetch()} what="overview" />}

      <StatStrip ariaLabel="Coverage ticker" className="ticker">
        <Stat label="Countries" value={s ? fmtInt(s.countries) : "—"} qualifier={s ? `${fmtInt(s.subnational)} sub-national` : undefined} to="/jurisdictions?level=country" />
        <Stat label="Rates" value={s ? fmtInt(s.rates) : "—"} qualifier="current + historical" to="/jurisdictions" />
        <Stat label="Regulations" value={s ? fmtInt(s.regulations) : "—"} to="/regulations" />
        <Stat label="Court decisions" value={s ? fmtInt(s.court_decisions) : "—"} to="/court-decisions" />
        <Stat label="Tariff measures" value={s ? fmtInt(s.tariffs) : "—"} to="/tariffs" />
        <Stat label="Sources" value={s ? `${fmtInt(s.sources_enabled)}/${fmtInt(s.sources)}` : "—"} qualifier="enabled" to="/sources" />
        <Stat label="Changes · 7 d" value={s ? fmtInt(s.changes_7d) : "—"} spark={h7.data && <Sparkline values={h7.data.days.map((d) => d.count)} title={sparkTitle(h7.data.days)} />} to="/changes" />
        <Stat label="Changes · 30 d" value={s ? fmtInt(s.changes_30d) : "—"} spark={h30.data && <Sparkline values={h30.data.days.map((d) => d.count)} title={sparkTitle(h30.data.days)} />} to="/changes" />
      </StatStrip>

      {freshInstall ? (
        <div className="region p-4">
          <p className="mb-2 text-sm text-ink-2">No crawl runs yet — seed the dataset and run the crawler:</p>
          <CodeBlock label="shell" code={"$ python -m app.crawler run --all"} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3.5">
          <section className="region" aria-labelledby="chg-day">
            <div className="region-head">
              <h2 id="chg-day">Changes per day · 30 d</h2>
              <span className="meta">
                {day ? (
                  <>
                    Feed filtered to <span className="mono text-ink-2">{day}</span> ·{" "}
                    <button type="button" className="underline decoration-hairline-strong underline-offset-2 hover:text-ink-1" onClick={() => setDay(null)}>
                      clear
                    </button>
                  </>
                ) : (
                  "Click a bar to filter the feed"
                )}
              </span>
              <span className="meta ml-auto">changes / day</span>
            </div>
            <div className="p-3" style={{ height: CHART_H + 24 }}>
              {h30.isLoading ? (
                <SkeletonBlock height={CHART_H} />
              ) : h30.isError ? (
                <ErrorState error={h30.error} onRetry={() => h30.refetch()} what="histogram" className="grid h-full place-items-center" />
              ) : (
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={perDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
                    <defs>
                      <pattern id="ov-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
                        <rect width="4" height="4" fill="var(--viz-nodata-fill)" />
                        <rect width="1" height="4" fill="var(--viz-nodata-line)" />
                      </pattern>
                    </defs>
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} interval={6} tick={TICK} tickLine={false} axisLine={{ stroke: "var(--hairline-strong)" }} height={18} />
                    <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={34} tickCount={4} tickFormatter={(v: number) => fmtInt(v)} />
                    <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTip fmt={(p) => `${fmtInt(p.count as number)} changes${p.gap ? " · no crawl run" : ""}`} />} />
                    <Bar dataKey={(d: { count: number; gap: boolean }) => (d.gap ? 1 : d.count)} isAnimationActive={false} radius={[1, 1, 0, 0]} className="cursor-pointer">
                      {perDay.map((d) => (
                        <Cell key={d.date} fill={d.gap ? "url(#ov-hatch)" : d.date === day ? "var(--accent-strong)" : "var(--viz-seq-6)"} stroke={d.gap ? "var(--viz-nodata-line)" : undefined} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="region" aria-labelledby="cov-type">
            <div className="region-head">
              <h2 id="cov-type">Coverage by tax type</h2>
              <span className="meta ml-auto">tracked items</span>
            </div>
            <div className="p-3" style={{ height: CHART_H + 24 }}>
              {stats.isLoading ? (
                <SkeletonBlock height={CHART_H} />
              ) : byType.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-ink-3">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={CHART_H}>
                  <BarChart data={byType} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap={3}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={118} interval={0} tick={{ ...TICK, fontFamily: "var(--font-sans)", fontSize: 11.5, fill: "var(--ink-2)" }} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTip fmt={(p) => `${fmtInt(p.value as number)} items`} />} />
                    <Bar dataKey="value" isAnimationActive={false} radius={[0, 1, 1, 0]}>
                      {byType.map((r) => (
                        <Cell key={r.key} fill={r.key === "__remaining__" ? "var(--viz-cat-other)" : "var(--viz-seq-6)"} />
                      ))}
                      <LabelList dataKey="value" position="right" formatter={(v) => fmtInt(Number(v))} style={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: "var(--ink-2)" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        </div>
      )}

      <section className="region overflow-hidden" aria-labelledby="latest">
        <div className="region-head">
          <h2 id="latest">Latest changes</h2>
          {day && (
            <span className="meta">
              on <span className="mono text-ink-2">{day}</span>
            </span>
          )}
          <Link to="/changes" className="ml-auto text-xs">
            Feed →
          </Link>
        </div>
        {recent.isLoading && <TableSkeleton rows={6} cols={3} />}
        {recent.isError && <ErrorState error={recent.error} onRetry={() => recent.refetch()} what="changes" />}
        {recent.data && recent.data.length === 0 && (
          <div className="tbl-slot">
            <div className="flex flex-col items-center gap-2">
              <p>{day ? `No changes detected on ${day}.` : "No changes yet."}</p>
              {day && (
                <Button size="sm" variant="ghost" onClick={() => setDay(null)}>
                  Show latest
                </Button>
              )}
            </div>
          </div>
        )}
        {grouped.map((g) => (
          <div key={g.day}>
            <div className="flex items-center gap-3 px-3 pt-2 pb-1">
              <span className="label-caps">{dayLabel(g.day)}</span>
              <span className="mono text-2xs text-ink-3">{fmtDate(g.day)}</span>
              <span className="h-px flex-1 bg-hairline" aria-hidden="true" />
            </div>
            {g.items.map((c) => (
              <ChangeRow key={c.id} c={c} compact />
            ))}
          </div>
        ))}
      </section>
    </Page>
  );
}

const TICK = { fontFamily: "var(--font-mono)", fontSize: 10.5, fill: "var(--ink-3)" } as const;

function sparkTitle(days: Array<{ count: number }>): string {
  const v = days.map((d) => d.count);
  return `min ${Math.min(...v)} · max ${Math.max(...v)} · last ${v[v.length - 1] ?? 0}`;
}

function groupByDay(items: ChangeEventOut[]): Array<{ day: string; items: ChangeEventOut[] }> {
  const out: Array<{ day: string; items: ChangeEventOut[] }> = [];
  for (const c of items) {
    const d = dayKey(c.detected_at);
    const last = out[out.length - 1];
    if (last && last.day === d) last.items.push(c);
    else out.push({ day: d, items: [c] });
  }
  return out;
}

function ChartTip(props: TooltipProps<number, string> & { fmt: (p: Record<string, unknown>) => string }) {
  const { active, fmt } = props;
  const payload = (props as unknown as { payload?: Array<{ payload: Record<string, unknown> }> }).payload;
  const lbl = (props as unknown as { label?: unknown }).label;
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Record<string, unknown>;
  return (
    <div className="tooltip static flex items-baseline gap-3">
      <span className="text-ink-2">{String(lbl ?? p.name ?? "")}</span>
      <span className="mono text-ink-1">{fmt(p)}</span>
    </div>
  );
}

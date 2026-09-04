import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { reportsApi } from "@/api";
import { Card, Empty, PageHeader, Stat, Tabs, cn } from "@/components/ui";
import { CHART, ChartFrame, ChartLegend, barChartProps, barProps, gridProps, moneyTooltipFormatter, tooltipProps, xAxisProps, yAxisMoneyProps } from "@/components/crm/charts";
import { money, num, pct, titleCase } from "@/lib/format";

type Tab = "pipeline" | "winloss" | "practice" | "origination" | "referrals" | "funnel" | "activity";
type Cell = number | string | null | undefined;
type Row = Record<string, Cell>;
type Col = { k: string; h: string; f?: (v: Cell) => string; right?: boolean; money?: boolean };

/* Skeleton rows for table loads (§6.6): no spinners. */
function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-5 py-4" role="status" aria-live="polite" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <span className="skeleton w-[30%]" /><span className="skeleton w-[20%]" /><span className="skeleton w-[15%]" /><span className="skeleton ml-auto w-[10%]" />
        </div>
      ))}
    </div>
  );
}

const isZeroish = (v: Cell) => v == null || v === 0 || v === "—";

/**
 * Report table. Headers normal case (via .tbl), numeric columns right-aligned tabular, money at 500.
 * `totals` renders a tfoot row keyed by column; missing keys render blank.
 */
function Table({ rows, cols, totals, dense }: { rows: Row[] | undefined; cols: Col[]; totals?: Record<string, ReactNode>; dense?: boolean }) {
  if (!rows) return <TableSkeleton />;
  if (rows.length === 0) return <Empty title="No data for this report" />;
  return (
    <table className={cn("tbl [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5", dense && "dense")}>
      <thead><tr>{cols.map((c) => <th key={c.k} className={cn(c.right && "!text-right", c.money && "w-[128px]")}>{c.h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map((c, j) => {
              const raw = r[c.k];
              const text = c.f ? c.f(raw) : String(raw ?? "—");
              const dim = c.right && isZeroish(raw);
              return (
                <td key={c.k} className={cn(c.right && "text-right num whitespace-nowrap", c.money && !dim && "font-medium", j === 0 && !c.right && "font-medium", dim && "text-sand-300")}>
                  {dim ? "—" : text}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      {totals && (
        <tfoot>
          <tr>{cols.map((c, j) => <td key={c.k} className={cn(c.right && "text-right num whitespace-nowrap")}>{j === 0 ? "Total" : totals[c.k] ?? ""}</td>)}</tr>
        </tfoot>
      )}
    </table>
  );
}

const m = (v: Cell) => money(Number(v ?? 0));
const n = (v: Cell) => num(Number(v ?? 0));
const p = (v: Cell) => (v == null ? "—" : pct(Number(v)));
const d1 = (v: Cell) => (v == null ? "—" : Number(v).toFixed(1));
/* Column sum for totals rows — totals must foot to the rows shown, not to a headline figure computed on a different population. */
const sumCol = (rows: Row[], k: string) => num(rows.reduce((a, r) => a + Number(r[k] ?? 0), 0));

function KpiRow({ children }: { children: ReactNode }) { return <div className="grid grid-cols-5 items-stretch gap-4">{children}</div>; }
function Loading() { return <Card padded={false}><TableSkeleton /></Card>; }

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("pipeline");
  const pipe = useQuery({ queryKey: ["r", "pipeline"], queryFn: reportsApi.pipeline, enabled: tab === "pipeline" });
  const vel = useQuery({ queryKey: ["r", "velocity"], queryFn: reportsApi.stageVelocity, enabled: tab === "pipeline" });
  const wl = useQuery({ queryKey: ["r", "wl"], queryFn: () => reportsApi.winLoss(12), enabled: tab === "winloss" });
  const pa = useQuery({ queryKey: ["r", "pa"], queryFn: reportsApi.practiceAreas, enabled: tab === "practice" });
  const orig = useQuery({ queryKey: ["r", "orig"], queryFn: reportsApi.origination, enabled: tab === "origination" });
  const ref = useQuery({ queryKey: ["r", "ref"], queryFn: reportsApi.referralSources, enabled: tab === "referrals" });
  const fun = useQuery({ queryKey: ["r", "funnel"], queryFn: () => reportsApi.funnel(12), enabled: tab === "funnel" });
  const act = useQuery({ queryKey: ["r", "act"], queryFn: () => reportsApi.activityLeaderboard(30), enabled: tab === "activity" });

  const monthLabel = (s: string) => { const [y, mo] = s.split("-"); const dt = new Date(Number(y), Number(mo) - 1, 1); return dt.toLocaleString("en-US", { month: "short" }) + (mo === "01" ? ` ’${y.slice(2)}` : ""); };

  return (
    <div>
      <PageHeader title="Reports" subtitle="All figures computed live from CRM records. Amounts are estimated first-year fees unless noted." />
      <div data-tour="report-tabs"><Tabs value={tab} onChange={setTab} tabs={[
        { key: "pipeline", label: "Pipeline & velocity" }, { key: "winloss", label: "Win / loss" }, { key: "practice", label: "Practice areas" },
        { key: "origination", label: "Origination credit" }, { key: "referrals", label: "Referral sources" }, { key: "funnel", label: "Lead funnel" }, { key: "activity", label: "Activity" },
      ]} /></div>
      <div className="mt-5 space-y-4">
        {tab === "pipeline" && (<>
          <Card title="Open pipeline by stage" padded={false}>
            <Table
              rows={pipe.data?.stages as Row[] | undefined}
              cols={[{ k: "stage", h: "Stage" }, { k: "count", h: "Count", f: n, right: true }, { k: "amount", h: "Amount", f: m, right: true, money: true }, { k: "weighted", h: "Weighted", f: m, right: true, money: true }, { k: "stale", h: "Stale", f: n, right: true }]}
              totals={pipe.data ? { count: num(pipe.data.total_count), amount: money(pipe.data.total_amount), weighted: money(pipe.data.total_weighted), stale: pipe.data.stale_count ? num(pipe.data.stale_count) : <span className="text-sand-300">—</span> } : undefined}
            />
          </Card>
          <Card title="Stage velocity" actions={<span className="text-sand-500">Average days in each stage before advancing</span>} padded={false}>
            <Table rows={vel.data as Row[] | undefined} cols={[{ k: "stage", h: "Stage" }, { k: "avg_days", h: "Avg. days", f: d1, right: true }, { k: "n", h: "Transitions", f: n, right: true }]} />
          </Card>
        </>)}

        {tab === "winloss" && (!wl.data ? <Loading /> : (<>
          <KpiRow>
            <Stat label="Win rate" value={pct(wl.data.win_rate)} sub="trailing 12 months" tone="good" />
            <Stat label="Won" value={num(wl.data.won_count)} sub={money(wl.data.won_amount)} />
            <Stat label="Lost" value={num(wl.data.lost_count)} sub={money(wl.data.lost_amount)} />
            <Stat label="Avg. won size" value={money(wl.data.avg_won_amount)} sub="per won engagement" />
            <Stat label="Avg. days to close" value={wl.data.avg_days_to_close == null ? "—" : Math.round(wl.data.avg_days_to_close)} sub="signed engagements" />
          </KpiRow>
          <Card title="Monthly closed" actions={<><ChartLegend items={[{ label: "Won", color: CHART.success }, { label: "Lost", color: CHART.dangerSoft }]} /><span className="ml-3 text-sand-500">Trailing 12 months</span></>}>
            {wl.data.monthly.length === 0 ? <Empty title="No closed opportunities in the period" /> : (
              <ChartFrame height={232}>
                <ResponsiveContainer>
                  <BarChart data={wl.data.monthly} {...barChartProps}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="month" tickFormatter={monthLabel} {...xAxisProps} />
                    <YAxis {...yAxisMoneyProps} />
                    <Tooltip {...tooltipProps} formatter={moneyTooltipFormatter} labelFormatter={(l) => monthLabel(String(l))} />
                    <Bar dataKey="won" name="Won" fill={CHART.success} {...barProps} />
                    <Bar dataKey="lost" name="Lost" fill={CHART.dangerSoft} {...barProps} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            )}
          </Card>
          <Card title="Lost reasons" padded={false}>
            <Table rows={wl.data.lost_reasons as Row[]} cols={[{ k: "reason", h: "Reason", f: (v) => titleCase(String(v)) }, { k: "count", h: "Count", f: n, right: true }]} totals={{ count: sumCol(wl.data.lost_reasons as Row[], "count") }} />
          </Card>
        </>))}

        {tab === "practice" && (
          <Card title="Pipeline and results by practice area" padded={false}>
            <Table rows={pa.data} cols={[
              { k: "practice_area", h: "Practice area" }, { k: "open_count", h: "Open", f: n, right: true }, { k: "open_amount", h: "Open amount", f: m, right: true, money: true },
              { k: "weighted", h: "Weighted", f: m, right: true, money: true }, { k: "won_count", h: "Won", f: n, right: true }, { k: "won_amount", h: "Won amount", f: m, right: true, money: true },
              { k: "lost_count", h: "Lost", f: n, right: true }, { k: "win_rate", h: "Win rate", f: p, right: true },
            ]} />
          </Card>
        )}

        {tab === "origination" && (
          <Card title="Origination credit by partner" padded={false}>
            <div className="border-b border-sand-150 px-5 py-3 text-[12px] leading-4 text-sand-500">
              Attribution = opportunity's originating partner. Won amount counts estimated first-year fees at close; recurring flags annual engagements. Use as an input to compensation review, not as the final figure — reconcile to billed fees.
            </div>
            <Table rows={orig.data} cols={[
              { k: "partner", h: "Partner" }, { k: "clients_originated", h: "Clients originated", f: n, right: true }, { k: "won_count", h: "Won", f: n, right: true },
              { k: "won_amount", h: "Won amount", f: m, right: true, money: true }, { k: "recurring_won", h: "Of which recurring", f: m, right: true, money: true },
              { k: "open_count", h: "Open", f: n, right: true }, { k: "open_weighted", h: "Open weighted", f: m, right: true, money: true },
            ]} />
          </Card>
        )}

        {tab === "referrals" && (
          <Card title="Referral sources" actions={<span className="text-sand-500">Who sends us work</span>} padded={false}>
            <Table rows={ref.data} cols={[
              { k: "source", h: "Source" }, { k: "organization", h: "Organization" }, { k: "referrals", h: "Referrals", f: n, right: true }, { k: "won_count", h: "Won", f: n, right: true },
              { k: "won_amount", h: "Won amount", f: m, right: true, money: true }, { k: "open_amount", h: "Open pipeline", f: m, right: true, money: true },
            ]} />
          </Card>
        )}

        {tab === "funnel" && (!fun.data ? <Loading /> : (<>
          <KpiRow>
            <Stat label="Leads" value={num(fun.data.leads)} sub="trailing 12 months" />
            <Stat label="Qualified" value={num(fun.data.qualified)} sub={fun.data.leads ? `${pct(fun.data.qualified / fun.data.leads)} of leads` : undefined} />
            <Stat label="Converted" value={num(fun.data.converted)} sub={fun.data.leads ? `${pct(fun.data.converted / fun.data.leads)} of leads` : undefined} />
            <Stat label="Opportunities" value={num(fun.data.opportunities)} sub="created from leads" />
            <Stat label="Won" value={num(fun.data.won)} sub={fun.data.opportunities ? `${pct(fun.data.won / fun.data.opportunities)} of opportunities` : undefined} tone="good" />
          </KpiRow>
          <Card title="Lead sources" actions={<span className="text-sand-500">Trailing 12 months</span>} padded={false}>
            <Table rows={fun.data.by_source} cols={[{ k: "source", h: "Source", f: (v) => titleCase(String(v)) }, { k: "leads", h: "Leads", f: n, right: true }, { k: "converted", h: "Converted", f: n, right: true }, { k: "won", h: "Won", f: n, right: true }]}
                   totals={{ leads: sumCol(fun.data.by_source, "leads"), converted: sumCol(fun.data.by_source, "converted"), won: sumCol(fun.data.by_source, "won") }} />
          </Card>
        </>))}

        {tab === "activity" && (
          <Card title="Activity leaderboard" actions={<span className="text-sand-500">Last 30 days</span>} padded={false}>
            <Table rows={act.data} cols={[
              { k: "user", h: "User" }, { k: "call", h: "Calls", f: n, right: true }, { k: "email", h: "Emails", f: n, right: true }, { k: "meeting", h: "Meetings", f: n, right: true },
              { k: "note", h: "Notes", f: n, right: true }, { k: "task", h: "Tasks", f: n, right: true }, { k: "total", h: "Total", f: n, right: true },
            ]} />
          </Card>
        )}
      </div>
    </div>
  );
}

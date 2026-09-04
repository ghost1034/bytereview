/**
 * Shared recharts styling for the finance-grade design system (DESIGN.md §6.17).
 * Everything here is static: no entrance animation, horizontal gridlines only, compact money ticks,
 * dark tooltip, custom legend rendered in the card header rather than recharts' default.
 */
import type { CSSProperties } from "react";
import { useMoney, num } from "@/components/firmcrm/lib/format";
import { cn } from "@/components/firmcrm/components/ui";

/* Categorical palette, in order of use. Pipeline-by-stage uses [0] amount and [1] weighted. */
export const CHART = {
  accent: "#4B55C8",
  accentSoft: "#97A2E4",
  success: "#1E7B4F",
  warn: "#B4600F",
  neutral: "#5F5B53",
  neutralSoft: "#C4BFB5",
  dangerSoft: "#F3C1BC",
  grid: "#EFEDE8",
  tick: "#7D786F",
} as const;
export const CHART_PALETTE = [CHART.accent, CHART.accentSoft, CHART.success, CHART.warn, CHART.neutral, CHART.neutralSoft];

export const gridProps = { vertical: false, stroke: CHART.grid, strokeDasharray: undefined } as const;
export const tickStyle = { fontSize: 11, fill: CHART.tick, fontVariantNumeric: "tabular-nums" } as const;
export const xAxisProps = { axisLine: false, tickLine: false, tick: tickStyle, tickMargin: 8 } as const;
export const yAxisCountProps = { axisLine: false, tickLine: false, tick: tickStyle, width: 32, tickFormatter: (v: number) => num(v), allowDecimals: false } as const;
export const barProps = { radius: [2, 2, 0, 0] as [number, number, number, number], maxBarSize: 40, isAnimationActive: false } as const;
export const barChartProps = { barCategoryGap: "28%", margin: { top: 8, right: 8, bottom: 0, left: 0 } } as const;

export const tooltipProps = {
  cursor: { fill: "rgba(26,25,22,.04)" },
  contentStyle: { background: "#1A1916", border: "none", borderRadius: 8, padding: "8px 10px", boxShadow: "var(--firmcrm-shadow-menu)" } as CSSProperties,
  labelStyle: { fontSize: 11, lineHeight: "14px", color: "#C4BFB5", marginBottom: 4 } as CSSProperties,
  itemStyle: { fontSize: 12, lineHeight: "16px", color: "#FFFFFF", padding: 0, fontVariantNumeric: "tabular-nums" } as CSSProperties,
  separator: ": ",
  isAnimationActive: false,
} as const;
export function useMoneyChartProps() {
  const money = useMoney();
  return {
    yAxisMoneyProps: { axisLine: false, tickLine: false, tick: tickStyle, width: 48, tickFormatter: (v: number) => money(v, true) },
    moneyTooltipFormatter: (v: number | string) => money(Number(v)),
  };
}
export const countTooltipFormatter = (v: number | string) => num(Number(v));

/* Custom legend: 8px square swatches, 12px secondary text. Render in the card header's `actions` slot. */
export function ChartLegend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 text-[12px] leading-4 text-crm-sand-600", className)} aria-hidden>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: i.color }} />{i.label}
        </span>
      ))}
    </div>
  );
}

/* Win / loss: one 8px horizontal stacked bar (won success-600 over lost danger-200). Not a donut. */
export function WinLossBar({ won, lost, className }: { won: number; lost: number; className?: string }) {
  const total = won + lost;
  const share = total > 0 ? (won / total) * 100 : 0;
  return (
    <div className={cn("flex h-2 w-full overflow-hidden rounded-full", total > 0 ? "bg-crm-danger-200" : "bg-crm-sand-150", className)} role="img" aria-label={total > 0 ? `${won} won, ${lost} lost` : "No closed opportunities"}>
      <i className="block h-full bg-crm-success-600" style={{ width: `${share}%` }} />
    </div>
  );
}

/* Fixed-height chart frame so ResponsiveContainer has a box to fill. 232px dashboard card, 160px rail card. */
export function ChartFrame({ height = 232, children, className }: { height?: number; children: React.ReactNode; className?: string }) {
  return <div className={cn("w-full", className)} style={{ height }}>{children}</div>;
}

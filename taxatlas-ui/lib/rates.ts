/* Rate metrics, value formatting and legend bin labels for the map.
 * Pure functions only — no React, no geometry (geo.ts imports from here, never the reverse). */
import type { SubnationalMetric, TaxRateOut } from "./types";
import { fmtAmount, fmtRate } from "./format";
import { RATE_KIND_LABEL, TAX_TYPE_LABEL } from "./enums";

export function groupRates(rates: TaxRateOut[]): Record<string, TaxRateOut[]> {
  const out: Record<string, TaxRateOut[]> = {};
  rates.forEach((r) => (out[r.tax_type] ??= []).push(r));
  return out;
}

/** A choropleth metric = one (tax_type, rate_kind) pair served by /map/choropleth. */
export interface MetricDef {
  id: string;
  /** Full label, as shown in the rail and the legend title. Stable: the E2E suite clicks on these. */
  label: string;
  tax_type: string;
  rate_kind: string;
  /** Short noun used in the legend's no-data row: "No VAT / not tracked". */
  short: string;
  /** Percent rates vs. currency thresholds (registration / economic-nexus amounts). */
  unit: "percent" | "amount";
  /** Short label for the row inside its tax-type group in the rail ("Standard", "Top marginal"). Defaults to the
   *  rate-kind label. `label` stays the full, unambiguous name used by the legend, tooltips and the E2E contract. */
  row?: string;
}

export const WORLD_METRICS: MetricDef[] = [
  { id: "vat:standard", label: "VAT / GST standard", tax_type: "vat", rate_kind: "standard", short: "VAT", unit: "percent", row: "Standard" },
  { id: "corporate_income:headline", label: "Corporate income headline", tax_type: "corporate_income", rate_kind: "headline", short: "CIT", unit: "percent", row: "Headline" },
  { id: "personal_income:top_marginal", label: "Personal income top marginal", tax_type: "personal_income", rate_kind: "top_marginal", short: "PIT", unit: "percent", row: "Top marginal" },
  { id: "withholding:dividends", label: "WHT on dividends", tax_type: "withholding", rate_kind: "dividends", short: "WHT", unit: "percent", row: "Dividends" },
  { id: "digital_services:standard", label: "Digital services tax", tax_type: "digital_services", rate_kind: "standard", short: "DST", unit: "percent", row: "Standard" },
];

export const US_STATE_METRICS: MetricDef[] = [
  { id: "sales_use:standard", label: "Sales & use (state rate)", tax_type: "sales_use", rate_kind: "standard", short: "sales tax", unit: "percent", row: "State rate" },
  { id: "corporate_income:headline", label: "Corporate income (headline)", tax_type: "corporate_income", rate_kind: "headline", short: "CIT", unit: "percent", row: "Headline" },
  { id: "personal_income:top_marginal", label: "Personal income (top marginal)", tax_type: "personal_income", rate_kind: "top_marginal", short: "PIT", unit: "percent", row: "Top marginal" },
  { id: "sales_use:economic_nexus_threshold", label: "Economic nexus threshold", tax_type: "sales_use", rate_kind: "economic_nexus_threshold", short: "threshold", unit: "amount", row: "Economic nexus threshold" },
];

/* ------------------------------------------------------------------------------------------------
   Metric definitions built at runtime from /map/subnational (tax_type, rate_kind) pairs. Known pairs get the
   curated label; anything new the seed adds (trade_tax, regional, stamp_duty …) gets a humanised label from the
   enum tables (or the raw value, sentence-cased) so the rail never shows a snake_case identifier.
   ------------------------------------------------------------------------------------------------ */

/** Short nouns for the legend's "No <x> / not tracked" row, per tax type. */
const SHORT_BY_TAX_TYPE: Record<string, string> = {
  vat: "VAT",
  gst: "GST",
  sales_use: "sales tax",
  corporate_income: "CIT",
  personal_income: "PIT",
  withholding: "WHT",
  capital_gains: "CGT",
  digital_services: "DST",
  customs_tariff: "tariff",
  excise: "excise",
  payroll_social: "payroll tax",
  property: "property tax",
  transfer_pricing: "TP rule",
  pillar_two: "Pillar Two",
};

/** Rate-kind labels for kinds not (yet) in lib/enums.ts. Sentence case. */
const EXTRA_KIND_LABEL: Record<string, string> = {
  municipal: "municipal",
  combined: "combined",
  surcharge: "surcharge",
  local_average: "local average",
};

/** Sub-national metrics introduced by the global seed (rates_subnational_global.py). The generic
 *  "<Tax type> (<kind>)" would be technically right but unhelpful to a tax reader, so each pair gets the noun
 *  practitioners use. `regional` depends on the tax type it is layered on (IT IRAP / JP enterprise tax vs. the
 *  addizionale regionale). Thresholds keep unit "amount" (payroll_social / other thresholds are INR caps). */
export const SUBNATIONAL_METRICS: MetricDef[] = [
  { id: "corporate_income:trade_tax", label: "Corporate income · trade tax (avg. Gewerbesteuer burden)", tax_type: "corporate_income", rate_kind: "trade_tax", short: "trade tax", unit: "percent", row: "Trade tax (avg. Gewerbesteuer)" },
  { id: "corporate_income:regional", label: "Regional business tax", tax_type: "corporate_income", rate_kind: "regional", short: "regional business tax", unit: "percent", row: "Regional business tax (IRAP / enterprise tax)" },
  { id: "personal_income:regional", label: "Regional income surtax", tax_type: "personal_income", rate_kind: "regional", short: "regional surtax", unit: "percent", row: "Regional surtax" },
  { id: "property:stamp_duty", label: "Stamp / transfer duty", tax_type: "property", rate_kind: "stamp_duty", short: "stamp duty", unit: "percent", row: "Stamp / transfer duty" },
  { id: "payroll_social:standard", label: "Payroll tax (state)", tax_type: "payroll_social", rate_kind: "standard", short: "payroll tax", unit: "percent", row: "State rate" },
  { id: "payroll_social:registration_threshold", label: "Payroll tax threshold", tax_type: "payroll_social", rate_kind: "registration_threshold", short: "payroll threshold", unit: "amount", row: "Registration threshold" },
  { id: "payroll_social:other", label: "Profession tax cap", tax_type: "payroll_social", rate_kind: "other", short: "profession tax", unit: "amount", row: "Profession tax cap" },
];

/** "economic_nexus_threshold" → "Economic nexus threshold". */
export function humanize(s: string): string {
  const t = s.replace(/[_-]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

// First definition wins: the world wording ("Corporate income headline") is canonical where the US list repeats an id.
const CURATED: Record<string, MetricDef> = {};
for (const m of [...WORLD_METRICS, ...US_STATE_METRICS, ...SUBNATIONAL_METRICS]) CURATED[m.id] ??= m;

/** MetricDef for any (tax_type, rate_kind). Curated labels for the known pairs; otherwise "<Tax type> (<kind>)"
 *  with the unit inferred from the kind (thresholds are currency amounts, everything else a percentage). */
export function buildMetric(tax_type: string, rate_kind: string): MetricDef {
  const id = `${tax_type}:${rate_kind}`;
  const curated = CURATED[id];
  if (curated) return curated;
  const tt = TAX_TYPE_LABEL[tax_type] ?? humanize(tax_type);
  const kindRaw = RATE_KIND_LABEL[rate_kind] ?? EXTRA_KIND_LABEL[rate_kind] ?? humanize(rate_kind);
  const kind = kindRaw[0].toLowerCase() + kindRaw.slice(1);
  // Thresholds/caps are currency amounts; `other` on payroll/other tax types is used for INR caps in the seed.
  const unit: MetricDef["unit"] = /threshold|amount|allowance|cap/.test(rate_kind) || (rate_kind === "other" && (tax_type === "payroll_social" || tax_type === "other")) ? "amount" : "percent";
  return { id, label: `${tt} (${kind})`, tax_type, rate_kind, short: SHORT_BY_TAX_TYPE[tax_type] ?? tt, unit, row: ROW_LABEL[rate_kind] ?? kindRaw };
}

/** Row wording inside a group where the enum label alone reads oddly. */
const ROW_LABEL: Record<string, string> = { zero: "Zero-rated", super_reduced: "Super-reduced", other: "Other" };

/** Label shown on a metric's rail row (inside its tax-type group). */
export function rowLabel(m: MetricDef): string {
  return m.row ?? RATE_KIND_LABEL[m.rate_kind] ?? humanize(m.rate_kind);
}

/* ------------------------------------------------------------------------------------------------
   Grouping. The rail lists metrics by tax type in a fixed editorial order (indirect taxes first, then income
   taxes, then the rest), and within a group by rate kind (the headline figure first, thresholds last). GST rows
   merge into the VAT group because /map/choropleth already treats tax_type=vat as VAT ∪ GST.
   ------------------------------------------------------------------------------------------------ */
export const METRIC_GROUP_ORDER = [
  "vat", "corporate_income", "pillar_two", "personal_income", "withholding", "capital_gains", "digital_services",
  "sales_use", "excise", "payroll_social", "property", "customs_tariff", "transfer_pricing", "other",
];
const KIND_ORDER = [
  "standard", "headline", "federal", "state_average", "trade_tax", "regional", "minimum", "top_marginal", "reduced", "super_reduced",
  "zero", "dividends", "interest", "royalties", "services", "stamp_duty", "registration_threshold", "economic_nexus_threshold", "other",
];
export const METRIC_GROUP_LABEL: Record<string, string> = {
  vat: "VAT / GST", corporate_income: "Corporate income", pillar_two: "Pillar Two", personal_income: "Personal income",
  withholding: "Withholding", capital_gains: "Capital gains", digital_services: "Digital services", sales_use: "Sales & use",
  excise: "Excise", payroll_social: "Payroll / social", property: "Property", customs_tariff: "Customs", transfer_pricing: "Transfer pricing", other: "Other",
};
export function groupLabel(taxType: string): string {
  return METRIC_GROUP_LABEL[taxType] ?? TAX_TYPE_LABEL[taxType] ?? humanize(taxType);
}
const rank = (order: string[], v: string) => {
  const i = order.indexOf(v);
  return i === -1 ? order.length : i;
};
function compareMetrics(a: MetricDef, b: MetricDef): number {
  return rank(METRIC_GROUP_ORDER, a.tax_type) - rank(METRIC_GROUP_ORDER, b.tax_type) || a.tax_type.localeCompare(b.tax_type) || rank(KIND_ORDER, a.rate_kind) - rank(KIND_ORDER, b.rate_kind) || a.rate_kind.localeCompare(b.rate_kind);
}

export interface MetricGroup {
  key: string;
  label: string;
  metrics: MetricDef[];
}
/** Consecutive metrics of the same tax type → one group (input must already be in metricsFor() order). */
export function groupMetrics(metrics: MetricDef[]): MetricGroup[] {
  const out: MetricGroup[] = [];
  for (const m of metrics) {
    const last = out[out.length - 1];
    if (last && last.key === m.tax_type) last.metrics.push(m);
    else out.push({ key: m.tax_type, label: groupLabel(m.tax_type), metrics: [m] });
  }
  return out;
}

/** Which metric the map opens on: the first `preferred` metric the list contains, else the first in group order.
 *  (US keeps "Sales & use" as its opener although Corporate income sorts first.) */
export function defaultMetricId(metrics: MetricDef[], preferred: MetricDef[] = []): string | null {
  for (const p of preferred) if (metrics.some((m) => m.id === p.id)) return p.id;
  return metrics[0]?.id ?? null;
}

/** Country-specific wording where the same (tax_type, rate_kind) pair names a different instrument. Keyed by the
 *  parent jurisdiction code, then metric id; the override is merged over the generic definition. Argentina's
 *  provincial Ingresos Brutos is seeded as sales_use:standard, which otherwise borrows the US "Sales & use" label. */
export const COUNTRY_METRIC_OVERRIDES: Record<string, Record<string, Partial<Pick<MetricDef, "label" | "short" | "unit" | "row">>>> = {
  AR: { "sales_use:standard": { label: "Gross receipts (Ingresos Brutos)", short: "gross receipts tax", row: "Ingresos Brutos (gross receipts)" } },
};

/** Metric list for a scope from the API's reported pairs: GST merges into VAT, duplicates collapse on id, curated
 *  labels where they exist, then grouped order (see METRIC_GROUP_ORDER). `parent` applies
 *  COUNTRY_METRIC_OVERRIDES. */
export function metricsFor(reported: Array<Pick<SubnationalMetric, "tax_type" | "rate_kind"> & Partial<SubnationalMetric>>, parent?: string): MetricDef[] {
  const overrides = parent ? COUNTRY_METRIC_OVERRIDES[parent] : undefined;
  const localise = (m: MetricDef): MetricDef => (overrides?.[m.id] ? { ...m, ...overrides[m.id] } : m);
  const seen = new Set<string>();
  const out: MetricDef[] = [];
  for (const r of reported) {
    const tax_type = r.tax_type === "gst" ? "vat" : r.tax_type;
    const id = `${tax_type}:${r.rate_kind}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(localise(buildMetric(tax_type, r.rate_kind)));
  }
  return out.sort(compareMetrics);
}

export function isThresholdMetric(m: Pick<MetricDef, "unit">): boolean {
  return m.unit === "amount";
}

/** Unit suffix shown after a value (rendered smaller, ink-3). */
export function metricUnit(m: Pick<MetricDef, "unit">, currency?: string | null): string {
  return m.unit === "percent" ? "%" : (currency ?? "");
}

/** Full-precision value for tooltips and drawers. Never rounds a figure the user might quote. */
export function fmtMetricValue(m: Pick<MetricDef, "unit">, v: number | null | undefined): string {
  if (v == null) return "—";
  return m.unit === "percent" ? fmtRate(v, 3) : fmtAmount(v);
}

/** Compact tick label for legend bin edges: "19", "7.5", "100k", "1.5M". No unit — the legend adds it once. */
export function fmtTick(m: Pick<MetricDef, "unit">, v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (m.unit === "percent") {
    const r = Math.round(v * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return trim(v / 1_000_000) + "M";
  if (abs >= 1_000) return trim(v / 1_000) + "k";
  return trim(v);
}

function trim(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, "");
}

/** Human range label for bin i, e.g. "12 – 16%" / "24%+" / "< 8%", used for the bin swatch `title`. */
export function binLabel(m: Pick<MetricDef, "unit">, ticks: number[], i: number, currency?: string | null): string {
  const unit = metricUnit(m, currency);
  const lo = ticks[i];
  const hi = ticks[i + 1];
  if (hi === undefined) return `${fmtTick(m, lo)}${unit}+`;
  if (i === 0 && ticks.length > 1) return `${fmtTick(m, lo)} – ${fmtTick(m, hi)}${unit}`;
  return `${fmtTick(m, lo)} – ${fmtTick(m, hi)}${unit}`;
}

/** Provenance fields added to /map/choropleth points (optional until lib/types.ts picks them up). */
export interface ChoroplethProvenance {
  as_of?: string | null;
  effective_from?: string | null;
  source_name?: string | null;
}

export interface LegendProvenance {
  /** Latest as-of date across points with data (YYYY-MM-DD), or null when the API sent none. */
  asOf: string | null;
  /** Up to two distinct source names, most frequent first. */
  sources: string[];
}

/** Legend "As of <date> · <sources>" inputs: max as_of over points with data, top-2 source names by count.
 *  Points without a value are ignored so untracked jurisdictions never drive the line. */
export function legendProvenance(points: Array<{ value: number | null } & ChoroplethProvenance>): LegendProvenance {
  let asOf: string | null = null;
  const counts = new Map<string, number>();
  for (const p of points) {
    if (p.value == null) continue;
    if (p.as_of && (!asOf || p.as_of > asOf)) asOf = p.as_of;
    if (p.source_name) counts.set(p.source_name, (counts.get(p.source_name) ?? 0) + 1);
  }
  const sources = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([name]) => name);
  return { asOf, sources };
}

export const OVERLAY_DEFS = {
  changes: { key: "changes", label: "Changes", marker: "circle", colorVar: "--viz-cat-1", field: "changes", noun: "changes in 30 d", tab: "changes" },
  court_decisions: { key: "court_decisions", label: "Court decisions", marker: "triangle", colorVar: "--viz-cat-3", field: "court_decisions", noun: "court decisions in 30 d", tab: "courts" },
  tariffs: { key: "tariffs", label: "Tariff measures in force", marker: "square", colorVar: "--viz-cat-4", field: "tariffs", noun: "tariff measures in force", tab: "tariffs" },
} as const;
export type OverlayKey = keyof typeof OVERLAY_DEFS;
export const OVERLAY_KEYS = Object.keys(OVERLAY_DEFS) as OverlayKey[];

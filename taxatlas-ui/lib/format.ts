import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

export function fmtDate(v: string | null | undefined, pattern = "yyyy-MM-dd"): string {
  if (!v) return "—";
  const d = parseISO(v);
  return isValid(d) ? format(d, pattern) : v;
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = parseISO(v);
  return isValid(d) ? format(d, "yyyy-MM-dd HH:mm") : v;
}

export function relTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = parseISO(v);
  if (!isValid(d)) return v;
  return `${formatDistanceToNowStrict(d, { addSuffix: true })}`;
}

export function fmtRate(rate: number | null | undefined, digits = 2): string {
  if (rate == null) return "—";
  const s = Number.isInteger(rate) ? rate.toString() : rate.toFixed(digits).replace(/\.?0+$/, "");
  return `${s}%`;
}

export function fmtAmount(v: number | null | undefined, currency?: string | null): string {
  if (v == null) return "—";
  const s = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
  return currency ? `${s} ${currency}` : s;
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US").format(v);
}

/** Human readable value for a rate row: rate if present, else threshold amount, else description. */
export function rateValue(r: { rate: number | null; threshold_amount: number | null; threshold_currency: string | null; description: string | null }): string {
  if (r.rate != null) return fmtRate(r.rate);
  if (r.threshold_amount != null) return fmtAmount(r.threshold_amount, r.threshold_currency);
  return r.description ?? "—";
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

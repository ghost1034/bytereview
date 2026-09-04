import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

export const money = (n: number | null | undefined, compact = false) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0, notation: compact ? "compact" : "standard" }).format(n);
export const pct = (n: number | null | undefined, digits = 0) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);
export const num = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("en-US").format(n));
export const fmtDate = (s: string | null | undefined) => (s ? format(parseISO(s), "MMM d, yyyy") : "—");
export const fmtDateTime = (s: string | null | undefined) => (s ? format(parseISO(s), "MMM d, yyyy · h:mm a") : "—");
export const ago = (s: string | null | undefined) => (s ? formatDistanceToNowStrict(parseISO(s), { addSuffix: true }) : "—");
export const titleCase = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—");
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
export const toDateInput = (s: string | null | undefined) => (s ? s.slice(0, 10) : "");

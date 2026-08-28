/* Shape-coded markers — replace coloured pill badges (components.md §5).
 * Every marker has a shape cue plus colour plus visible text; colour is never the only signal. */
import type { ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";
import { fmtDate } from "@/taxatlas-ui/lib/format";

export type Tone = "positive" | "info" | "pending" | "halt" | "negative" | "neutral";

/** Enum value → tone. Unknown values fall back to `neutral` (dashed ring). */
export const STATUS_TONE: Record<string, Tone> = {
  // positive — filled sage
  effective: "positive",
  in_force: "positive",
  success: "positive",
  active: "positive",
  verified: "positive",
  enabled: "positive",
  ok: "positive",
  sent: "positive",
  taxpayer: "positive",
  taxpayer_win: "positive",
  created: "positive",
  // info — filled steel
  enacted: "info",
  amended: "info",
  updated: "info",
  mixed: "info",
  government: "info",
  reported: "info",
  rate_changed: "info",
  // pending — hollow copper ring
  proposed: "pending",
  consultation: "pending",
  under_review: "pending",
  pending: "pending",
  running: "pending",
  remanded: "pending",
  estimated: "pending",
  status_changed: "pending",
  // halt — copper square
  suspended: "halt",
  repealed: "halt",
  expired: "halt",
  disabled: "halt",
  revoked: "halt",
  // negative — filled ember
  failed: "negative",
  removed: "negative",
  dead: "negative",
  authority_win: "negative",
  // neutral — dashed ring
  unknown: "neutral",
  guidance: "neutral",
  skipped: "neutral",
  unchanged: "neutral",
  routine: "neutral",
};

export function statusTone(value: string | null | undefined): Tone {
  if (!value) return "neutral";
  return STATUS_TONE[value] ?? "neutral";
}

function humanize(v: string): string {
  return v.replace(/_/g, " ");
}

/** 7 px dot + text. `revoked` keys should pass `tone="negative"` explicitly. */
export function StatusMark({
  value,
  label,
  tone,
  className,
  title,
}: {
  value: string | null | undefined;
  label?: ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
}) {
  if (!value) return <span className="text-ink-3">—</span>;
  return (
    <span className={cn("status", className)} data-tone={tone ?? statusTone(value)} title={title}>
      {label ?? humanize(value)}
    </span>
  );
}

/** 9 px square + text, optionally followed by "as of YYYY-MM-DD". */
export function ConfidenceMark({ level, asOf, className }: { level: string | null | undefined; asOf?: string | null; className?: string }) {
  if (!level) return <span className="text-ink-3">—</span>;
  return (
    <span className={cn("conf", className)} data-level={level}>
      <i aria-hidden="true" />
      {humanize(level)}
      {asOf && (
        <span className="asof">
          as of <span className="mono">{fmtDate(asOf)}</span>
        </span>
      )}
    </span>
  );
}

/** Mono glyph + text: ◆ landmark (brass) · ◇ significant · · routine. */
export function SignificanceMark({ level, className }: { level: string | null | undefined; className?: string }) {
  if (!level) return <span className="text-ink-3">—</span>;
  return (
    <span className={cn("sig", className)} data-level={level}>
      {humanize(level)}
    </span>
  );
}

export const CHANGE_GLYPH: Record<string, string> = {
  created: "+",
  updated: "~",
  rate_changed: "Δ",
  status_changed: "→",
  removed: "−",
};

/** Mono glyph in a 14 px column for change types. */
export function ChangeGlyph({ type, className }: { type: string | null | undefined; className?: string }) {
  const g = type ? CHANGE_GLYPH[type] ?? "·" : "·";
  return (
    <span className={cn("glyph", className)} title={type ? humanize(type) : undefined} aria-label={type ? humanize(type) : undefined}>
      {g}
    </span>
  );
}

/** The only pill in the system: mono counts on tabs and section headers. */
export function CountPill({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span className={cn("count-pill", className)} title={title}>
      {children}
    </span>
  );
}

/* Aliases matching the implementation plan's naming. */
export { StatusMark as StatusMarker, ConfidenceMark as ConfidenceMarker };

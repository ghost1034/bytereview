/* WP-C marker adapters over the WP-A primitives in components/ui/Marker (kept so the WP-C pages and the map
   slide-over keep stable import names). Every marker renders visible text next to the shape. */
import { ChangeGlyph as UiChangeGlyph, ConfidenceMark, CountPill as UiCountPill, SignificanceMark as UiSignificanceMark, StatusMark } from "@/taxatlas-ui/components/ui/Marker";
import { ENTITY_GLYPH, ENTITY_LABEL, label, type StatusTone } from "@/taxatlas-ui/lib/enums";

export function StatusMarker({ value, tone, text, title }: { value: string | null | undefined; tone?: StatusTone; text?: string; title?: string }) {
  return <StatusMark value={value} tone={tone} label={text} title={title} />;
}

export function ConfidenceMarker({ level, asOf }: { level: string | null | undefined; asOf?: string | null }) {
  return <ConfidenceMark level={level} asOf={asOf} />;
}

export function SignificanceMark({ level }: { level: string | null | undefined }) {
  return <UiSignificanceMark level={level} />;
}

export function ChangeGlyph({ type }: { type: string }) {
  return <UiChangeGlyph type={type} />;
}

/** Entity glyph for the feed meta line (mono letter, no icon). `title` carries the raw entity type. */
export function EntityGlyph({ type }: { type: string }) {
  return (
    <span title={type} aria-label={label(ENTITY_LABEL, type)} className="mono">
      {ENTITY_GLYPH[type] ?? "·"}
    </span>
  );
}

export function CountPill({ n }: { n: number | string }) {
  return <UiCountPill>{typeof n === "number" ? new Intl.NumberFormat("en-US").format(n) : n}</UiCountPill>;
}

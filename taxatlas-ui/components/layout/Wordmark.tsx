import { cn } from "@/taxatlas-ui/lib/utils";

/** Globe glyph with a single brass dot — the only mark in the wordmark. Stroke follows ink-1. */
export function WordmarkGlyph({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn("glyph", className)} width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.25" fill="none" stroke="var(--ink-1)" strokeWidth="1.25" />
      <path d="M1.75 9h14.5M9 1.75v14.5M4 4.5c2.8 1.6 7.2 1.6 10 0M4 13.5c2.8-1.6 7.2-1.6 10 0" fill="none" stroke="var(--ink-1)" strokeWidth="1" opacity=".7" />
      <circle cx="11.5" cy="6.5" r="1.4" fill="var(--accent)" />
    </svg>
  );
}

/** Glyph + serif "TaxAtlas". `size` is the serif font size in px (19 in the bar, 34 on auth pages). */
export function Wordmark({ size = 19, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)} style={{ gap: Math.round(size * 0.45) }}>
      <WordmarkGlyph size={Math.round(size * 0.95)} />
      <span className="serif text-ink-1" style={{ fontSize: size, lineHeight: 1, paddingTop: Math.round(size * 0.1) }}>
        TaxAtlas
      </span>
    </span>
  );
}

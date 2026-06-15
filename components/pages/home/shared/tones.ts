/**
 * Per-product / per-section accent system for the dark homepage.
 *
 * The page used to render every icon chip, eyebrow, and headline in the single
 * `accent-blue` brand ramp, which made fourteen sections read as one undifferentiated
 * navy wall. Each product now gets a distinct, well-separated hue so the eye can tell
 * sections apart — while the primary CTA stays brand-blue everywhere for a consistent
 * conversion action.
 *
 * All values are written as complete literal class strings (never interpolated) so
 * Tailwind's content scanner keeps them. Hues use Tailwind's built-in palettes
 * (cyan/violet/emerald/amber/sky); `blue` reuses the existing brand `accent-blue` ramp.
 * The 300/400 shades are light pastels that clear WCAG AA on the navy `#0F1729` surface.
 */
export type Accent =
  | 'blue'
  | 'cyan'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'sky'

export interface AccentStyle {
  /** Icon chip: tinted background + foreground + inset ring. */
  chip: string
  /** Accent foreground for small text, links, inline icons. */
  text: string
  /** Eyebrow pill: border + tinted background + foreground. */
  pill: string
  /** Card hover border. */
  hoverBorder: string
  /** Headline highlight gradient (`bg-gradient-to-r ... bg-clip-text text-transparent`). */
  gradient: string
  /** Bullet / status dot fill. */
  dot: string
}

export const ACCENTS: Record<Accent, AccentStyle> = {
  blue: {
    chip: 'bg-accent-blue-400/10 text-accent-blue-300 ring-1 ring-accent-blue-400/20',
    text: 'text-accent-blue-300',
    pill: 'border-accent-blue-400/30 bg-accent-blue-400/10 text-accent-blue-300',
    hoverBorder: 'hover:border-accent-blue-400/40',
    gradient: 'from-accent-blue-300 to-accent-blue-500',
    dot: 'bg-accent-blue-400',
  },
  cyan: {
    chip: 'bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20',
    text: 'text-cyan-300',
    pill: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
    hoverBorder: 'hover:border-cyan-400/40',
    gradient: 'from-cyan-300 to-cyan-500',
    dot: 'bg-cyan-400',
  },
  violet: {
    chip: 'bg-violet-400/10 text-violet-300 ring-1 ring-violet-400/20',
    text: 'text-violet-300',
    pill: 'border-violet-400/30 bg-violet-400/10 text-violet-300',
    hoverBorder: 'hover:border-violet-400/40',
    gradient: 'from-violet-300 to-violet-500',
    dot: 'bg-violet-400',
  },
  emerald: {
    chip: 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20',
    text: 'text-emerald-300',
    pill: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    hoverBorder: 'hover:border-emerald-400/40',
    gradient: 'from-emerald-300 to-emerald-500',
    dot: 'bg-emerald-400',
  },
  amber: {
    chip: 'bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20',
    text: 'text-amber-300',
    pill: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    hoverBorder: 'hover:border-amber-400/40',
    gradient: 'from-amber-300 to-amber-500',
    dot: 'bg-amber-400',
  },
  sky: {
    chip: 'bg-sky-400/10 text-sky-300 ring-1 ring-sky-400/20',
    text: 'text-sky-300',
    pill: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
    hoverBorder: 'hover:border-sky-400/40',
    gradient: 'from-sky-300 to-sky-500',
    dot: 'bg-sky-400',
  },
}

/** Resolve an accent style, falling back to brand blue. */
export function accent(tone: Accent = 'blue'): AccentStyle {
  return ACCENTS[tone] ?? ACCENTS.blue
}

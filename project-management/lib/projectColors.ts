import { PROJECT_COLORS, type ProjectColorToken } from './colors'

const BRAND_MAP: Record<string, string> = {
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
}

const MUTED_MAP: Record<string, string> = {
  rose: '#e8b4b8',
  peach: '#f0c9a6',
  amber: '#e8c872',
  lime: '#b8d4a0',
  teal: '#8ec5c5',
  indigo: '#a8b0d4',
}

/** Resolve a project color token to a CSS color value. */
export function projectColorValue(color: string): string {
  return BRAND_MAP[color] ?? MUTED_MAP[color] ?? BRAND_MAP.primary
}

/** Soft background for project icon tiles. */
export function projectColorSoft(color: string): string {
  if (color === 'primary') return 'var(--primary-soft)'
  if (color === 'accent') return 'var(--accent-soft)'
  if (color === 'warning') return 'var(--warning-soft)'
  if (color === 'danger') return 'var(--danger-soft)'
  if (color === 'info') return 'var(--info-soft)'
  const base = MUTED_MAP[color]
  return base ? `${base}33` : 'var(--primary-soft)'
}

export { PROJECT_COLORS, type ProjectColorToken }

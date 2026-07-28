const PALETTE = [
  '#CC785C',
  '#6B8E5A',
  '#B85968',
  '#C99846',
  '#5C7A8C',
  '#8B6F47',
  '#A0795B',
  '#8B5E83',
  '#5E8A8B',
  '#A07B3F',
] as const

export const AVATAR_PALETTE: readonly string[] = PALETTE

const WORKSPACE_PALETTE = ['#CC785C', '#6B8E5A', '#B85968', '#C99846', '#5C7A8C', '#8B6F47']

/** Deterministic tile background from a display name (6-color palette). */
export function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % 9973
  return WORKSPACE_PALETTE[hash % WORKSPACE_PALETTE.length]
}

/** Deterministic avatar color from user id. */
export function colorForUser(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * (i + 1)) % 9973
  return PALETTE[hash % PALETTE.length]
}

/** Derive initials from a display name (max two characters). */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export const PROJECT_COLORS = [
  'primary',
  'accent',
  'warning',
  'danger',
  'info',
  'rose',
  'peach',
  'amber',
  'lime',
  'teal',
  'indigo',
] as const

export type ProjectColorToken = (typeof PROJECT_COLORS)[number]

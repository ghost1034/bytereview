/** Warm Tasklytic chart palette for reporting dashboards. */
export const WARM_CHART_PALETTE = [
  '#CC785C',
  '#6B8E5A',
  '#C99846',
  '#5C7A8C',
  '#B85968',
  '#8B6F47',
  '#A0795B',
  '#8B5E83',
  '#5E8A8B',
  '#A07B3F',
] as const

/** Pick a palette color by index with wrap-around. */
export function warmColor(index: number): string {
  return WARM_CHART_PALETTE[index % WARM_CHART_PALETTE.length]
}

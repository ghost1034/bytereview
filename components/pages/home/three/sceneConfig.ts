import * as THREE from 'three'

/**
 * Brand colors for the 3D scenes. These mirror the CSS tokens in app/globals.css
 * (`--marketing-hero-from/-accent`, `--info`). They're kept as constants here rather
 * than read from CSS because the marketing-dark tokens are scoped to the homepage
 * wrapper, not :root, which makes runtime getComputedStyle reads unreliable.
 */
export const BRAND = {
  navy: new THREE.Color('#0F1729'),
  navyLight: new THREE.Color('#122349'),
  accent: new THREE.Color('#6E97F7'),
  info: new THREE.Color('#1980E6'),
  paper: new THREE.Color('#DCE6FB'),
}

export interface SceneQuality {
  cols: number
  rows: number
  particles: number
  bloom: boolean
}

/** Per-quality tuning. 'low' (mobile / low-power) drops particles + bloom and shrinks the grid. */
export const QUALITY: Record<'high' | 'low', SceneQuality> = {
  high: { cols: 12, rows: 5, particles: 1600, bloom: true },
  low: { cols: 8, rows: 4, particles: 0, bloom: false },
}

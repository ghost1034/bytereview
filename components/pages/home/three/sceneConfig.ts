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

/**
 * Per-quality tuning. The scene is intentionally a quiet ambient layer: no particles
 * and no bloom on either tier, with a sparse sheet count so it stays atmosphere, not
 * wallpaper. 'low' (mobile / low-power) shrinks the grid further.
 */
export const QUALITY: Record<'high' | 'low', SceneQuality> = {
  high: { cols: 9, rows: 4, particles: 0, bloom: false },
  low: { cols: 6, rows: 3, particles: 0, bloom: false },
}

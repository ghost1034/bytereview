/* Raster images registered on the MapLibre style. Only one today: the "hatch" fill pattern for no-data land.
 * It is theme-coloured, so WorldMap regenerates it whenever the palette changes (map.updateImage keeps the size).
 * Overlay markers are DOM <Marker> SVGs (see OverlayLayer.tsx) — exact 1 px strokes at any radius and token
 * colours without regeneration — so they need no images here. */

export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export const IMG_PIXEL_RATIO = 2;
export const HATCH_ID = "hatch";

/** 8×8 CSS px (16×16 device) diagonal hatch at 135°, matching the --viz-nodata-hatch token, tiling seamlessly. */
export function hatchImage(fill: string, line: string): RasterImage {
  const s = 8 * IMG_PIXEL_RATIO;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  if (!ctx) return { width: s, height: s, data: new Uint8ClampedArray(s * s * 4) };
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1 * IMG_PIXEL_RATIO;
  ctx.beginPath();
  for (let x = -s; x <= s; x += s / 2) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x + s, s);
  }
  ctx.stroke();
  return { width: s, height: s, data: ctx.getImageData(0, 0, s, s).data };
}

/** Marker radius on a sqrt scale (area ∝ count), floored so a count of 1 is still a visible 3.5 px mark. */
export function bubbleRadius(v: number, max: number, rMin = 3.5, rMax = 26): number {
  if (v <= 0 || max <= 0) return 0;
  return Math.max(rMin, rMax * Math.sqrt(v / max));
}

/** SVG path for a marker of the given shape, centred at (0,0), area-matched to a circle of radius r. */
export function markerPath(kind: "circle" | "triangle" | "square", r: number): string {
  if (kind === "circle") return `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  if (kind === "square") {
    const h = (r * Math.sqrt(Math.PI)) / 2;
    return `M ${-h} ${-h} H ${h} V ${h} H ${-h} Z`;
  }
  const side = r * Math.sqrt((4 * Math.PI) / Math.sqrt(3));
  const hgt = (side * Math.sqrt(3)) / 2;
  // Centroid at origin: apex at −2h/3, base at +h/3.
  return `M 0 ${(-2 * hgt) / 3} L ${side / 2} ${hgt / 3} L ${-side / 2} ${hgt / 3} Z`;
}

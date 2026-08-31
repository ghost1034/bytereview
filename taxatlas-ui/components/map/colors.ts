/* Map colours come from the design tokens (taxatlas.css) at runtime, so the MapLibre canvas follows the
 * same light/dark theme as the DOM. MapLibre paint properties cannot reference CSS variables, so we read the
 * computed values off .taxatlas-root and re-resolve whenever the theme or palette changes (see theme.ts).
 *
 * FALLBACK mirrors the default dark Ocean palette and is used only if the module or stylesheet is not loaded
 * (e.g. a unit test or the first render before the container mounts). Keep it in sync with taxatlas.css. */

export interface MapPalette {
  ocean: string;
  outline: string;
  outlineHover: string;
  outlineSelected: string;
  graticule: string;
  /** Seven luminance-ordered steps, low → high. */
  seq: string[];
  nodataFill: string;
  nodataLine: string;
  nodataHatch: string;
  /** Overlay categoricals keyed by token name (--viz-cat-1 …). */
  cat: Record<string, string>;
  ink3: string;
}

const FALLBACK: Record<string, string> = {
  "--map-ocean": "#111110",
  "--map-land-outline": "#3a3a36",
  "--map-land-outline-hover": "#d9d5cc",
  "--map-land-outline-selected": "#e0b765",
  "--map-graticule": "rgba(235, 232, 225, 0.035)",
  "--viz-seq-1": "#243a50",
  "--viz-seq-2": "#214d66",
  "--viz-seq-3": "#2a6b84",
  "--viz-seq-4": "#38899c",
  "--viz-seq-5": "#5ea9b1",
  "--viz-seq-6": "#92c9c6",
  "--viz-seq-7": "#cfe8e3",
  "--viz-nodata-fill": "#1b1b19",
  "--viz-nodata-line": "#33332f",
  "--viz-nodata-hatch": "repeating-linear-gradient(135deg, transparent 0 3px, #2a2a27 3px 4px)",
  "--viz-cat-1": "#d4a534",
  "--viz-cat-3": "#a48ed3",
  "--viz-cat-4": "#d67f90",
  "--ink-3": "#85817a",
};

export function cssVar(name: string): string {
  if (typeof document === "undefined") return FALLBACK[name] ?? "";
  const root = document.querySelector<HTMLElement>(".taxatlas-root");
  const v = root ? getComputedStyle(root).getPropertyValue(name).trim() : "";
  return v || FALLBACK[name] || "";
}

/** The hatch token is a CSS gradient; the stroke colour is the only literal colour inside it. */
function hatchLine(gradient: string, fallback: string): string {
  const m = gradient.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)/g);
  return m ? m[m.length - 1] : fallback;
}

export function resolvePalette(): MapPalette {
  const hatchGradient = cssVar("--viz-nodata-hatch");
  const nodataLine = cssVar("--viz-nodata-line");
  return {
    ocean: cssVar("--map-ocean"),
    outline: cssVar("--map-land-outline"),
    outlineHover: cssVar("--map-land-outline-hover"),
    outlineSelected: cssVar("--map-land-outline-selected"),
    graticule: cssVar("--map-graticule"),
    seq: [1, 2, 3, 4, 5, 6, 7].map((i) => cssVar(`--viz-seq-${i}`)),
    nodataFill: cssVar("--viz-nodata-fill"),
    nodataLine,
    nodataHatch: hatchLine(hatchGradient, nodataLine),
    cat: { "--viz-cat-1": cssVar("--viz-cat-1"), "--viz-cat-3": cssVar("--viz-cat-3"), "--viz-cat-4": cssVar("--viz-cat-4") },
    ink3: cssVar("--ink-3"),
  };
}

/** Overlay bubble radius (px) on a sqrt scale, 3.5 → 26 px, per components.md §12. */
export const BUBBLE_MIN = 3.5;
export const BUBBLE_MAX = 26;

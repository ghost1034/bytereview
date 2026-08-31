/* Choropleth palette (sequential ramp) preference. The choice lives on .taxatlas-root[data-palette] so
 * taxatlas.css can copy the selected ramp into --viz-seq-1…7 (which colors.ts reads for MapLibre and the legend
 * swatches), and in localStorage "ta.palette" so it survives reloads. MapPage also reflects it in ?palette= so a
 * shared link reproduces the presenter's colours. Default (no attribute) is "ocean". */

export const PALETTE_KEY = "ta.palette";
export type PaletteId = "ocean" | "ember" | "viridis" | "magma";
export const DEFAULT_PALETTE: PaletteId = "ocean";

export const PALETTES: Array<{ id: PaletteId; label: string; hint: string }> = [
  { id: "ocean", label: "Ocean", hint: "Pale ice → teal → deep navy (default)" },
  { id: "ember", label: "Ember", hint: "Slate → brass (the original TaxAtlas ramp)" },
  { id: "viridis", label: "Viridis", hint: "Perceptually uniform purple → green → yellow" },
  { id: "magma", label: "Magma", hint: "Perceptually uniform indigo → magenta → peach" },
];

export function isPaletteId(v: unknown): v is PaletteId {
  return typeof v === "string" && PALETTES.some((p) => p.id === v);
}

export function readPalette(): PaletteId {
  const attr = typeof document === "undefined" ? undefined : document.querySelector<HTMLElement>(".taxatlas-root")?.dataset.palette;
  if (isPaletteId(attr)) return attr;
  try {
    const stored = localStorage.getItem(PALETTE_KEY);
    if (isPaletteId(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PALETTE;
}

/** Apply and persist. The default palette removes the attribute so the stylesheet's own default applies. */
export function applyPalette(id: PaletteId): void {
  const root = document.querySelector<HTMLElement>(".taxatlas-root");
  if (root) {
    if (id === DEFAULT_PALETTE) delete root.dataset.palette;
    else root.dataset.palette = id;
  }
  try {
    localStorage.setItem(PALETTE_KEY, id);
  } catch {
    /* storage unavailable */
  }
  // theme.ts observes the attribute change and re-resolves the MapLibre colours; this event covers the
  // "same value re-applied" case where no mutation fires.
  window.dispatchEvent(new CustomEvent("ta:palette", { detail: id }));
}

/** CSS variable names of the seven steps of a ramp (for legend previews that must not follow the active palette). */
export function rampVars(id: PaletteId): string[] {
  return [1, 2, 3, 4, 5, 6, 7].map((i) => `var(--viz-ramp-${id}-${i})`);
}

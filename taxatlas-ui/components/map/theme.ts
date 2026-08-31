/* Theme access for the map. The app-wide hook (hooks/useTheme.ts) owns the preference; this module only
 * needs to (a) know the effective theme so MapLibre paint colours can be re-resolved, and (b) offer the toggle
 * that lives in the map controls (pages/map.md: the projector use case). Both write the same contract:
 *   .taxatlas-root[data-theme="dark" | "light" | "auto"]  +  localStorage "ta.theme". */
import { useCallback, useEffect, useState } from "react";
import { getTheme, resolvedTheme, setTheme } from "@/taxatlas-ui/hooks/useTheme";
import { resolvePalette, type MapPalette } from "./colors";

export type ThemePref = "dark" | "light" | "auto";
export type Theme = "dark" | "light";
export const THEME_KEY = "ta.theme";

export function readThemePref(): ThemePref {
  const attr = typeof document === "undefined" ? undefined : document.querySelector<HTMLElement>(".taxatlas-root")?.dataset.theme;
  if (attr === "dark" || attr === "light" || attr === "auto") return attr;
  return getTheme();
}

export function applyThemePref(pref: ThemePref): void {
  setTheme(pref);
  window.dispatchEvent(new CustomEvent("ta:theme", { detail: pref }));
}

/** What the stylesheet actually resolved to. taxatlas.css sets `color-scheme` in every theme block, so reading the
 *  computed value covers dark, light and auto (OS) without re-implementing the media-query logic. */
export function effectiveTheme(): Theme {
  const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".taxatlas-root");
  const scheme = root ? getComputedStyle(root).colorScheme : "";
  if (scheme.includes("light")) return "light";
  if (scheme.includes("dark")) return "dark";
  return resolvedTheme();
}

export function useMapTheme(): { theme: Theme; palette: MapPalette; toggle: () => void } {
  const [state, setState] = useState(() => ({ theme: effectiveTheme(), palette: resolvePalette() }));

  useEffect(() => {
    let raf = 0;
    const refresh = () => {
      cancelAnimationFrame(raf);
      // Next frame: let the stylesheet recompute before we read variables.
      raf = requestAnimationFrame(() => setState({ theme: effectiveTheme(), palette: resolvePalette() }));
    };
    const mo = new MutationObserver(refresh);
    const root = document.querySelector<HTMLElement>(".taxatlas-root");
    if (root) mo.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-palette", "class", "style"] });
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", refresh);
    window.addEventListener("ta:theme", refresh);
    window.addEventListener("ta:palette", refresh);
    refresh();
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      mq.removeEventListener("change", refresh);
      window.removeEventListener("ta:theme", refresh);
      window.removeEventListener("ta:palette", refresh);
    };
  }, []);

  const toggle = useCallback(() => applyThemePref(effectiveTheme() === "dark" ? "light" : "dark"), []);
  return { ...state, toggle };
}

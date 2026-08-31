/* Theme store: writes data-theme on .taxatlas-root, persists under `ta.theme`.
 * "dark" is the in-app default; auth pages force "auto" (follow the OS) while mounted. */
import { useEffect, useState } from "react";

export type Theme = "dark" | "light" | "auto";
const KEY = "ta.theme";
const THEMES: Theme[] = ["dark", "light", "auto"];

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v as Theme) ? (v as Theme) : "dark";
  } catch {
    return "dark";
  }
}

let current: Theme = read();
let forced: Theme | null = null;
const listeners = new Set<(t: Theme) => void>();

function apply(): void {
  if (typeof document === "undefined") return;
  document.querySelector<HTMLElement>(".taxatlas-root")?.setAttribute("data-theme", forced ?? current);
}

/** Apply the persisted theme immediately (call once at app start). */
export function initTheme(): void {
  apply();
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(t: Theme): void {
  current = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode */
  }
  apply();
  listeners.forEach((fn) => fn(t));
}

export function cycleTheme(): Theme {
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  setTheme(next);
  return next;
}

/** The theme actually painted, resolving "auto" against the OS preference. */
export function resolvedTheme(): "dark" | "light" {
  const t = forced ?? current;
  if (t !== "auto") return t;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [t, set] = useState<Theme>(current);
  useEffect(() => {
    listeners.add(set);
    return () => {
      listeners.delete(set);
    };
  }, []);
  return [t, setTheme];
}

/** Pin a theme while the calling component is mounted (auth pages → "auto"). */
export function useForcedTheme(t: Theme): void {
  useEffect(() => {
    forced = t;
    apply();
    return () => {
      forced = null;
      apply();
    };
  }, [t]);
}

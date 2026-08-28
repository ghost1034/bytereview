import { Download, Minus, Moon, Plus, RotateCcw, Sun } from "lucide-react";
import type { Theme } from "./theme";

interface Props {
  /** Shift left of the drawer when it is open. */
  shifted: boolean;
  theme: Theme;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleTheme: () => void;
  onExport: (() => void) | null;
}

/** Floating map controls (components.md §12): two groups of 28 px icon buttons on --surface-glass.
 *  MapLibre's own controls are hidden; these are the only chrome on the canvas besides the rail. */
export function MapControls({ shifted, theme, onZoomIn, onZoomOut, onReset, onToggleTheme, onExport }: Props) {
  return (
    <div className={shifted ? "mp-ctrls shifted" : "mp-ctrls"}>
      <div className="mp-ctrl-group" role="group" aria-label="Zoom">
        <button type="button" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in (+)">
          <Plus />
        </button>
        <button type="button" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out (−)">
          <Minus />
        </button>
        <button type="button" onClick={onReset} aria-label="Reset view" title="Reset view (0)">
          <RotateCcw />
        </button>
      </div>
      <div className="mp-ctrl-group" role="group" aria-label="Display">
        <button type="button" onClick={onToggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Light theme (l)" : "Dark theme (l)"}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <button type="button" onClick={onExport ?? undefined} disabled={!onExport} aria-label="Export current metric as CSV" title="Export CSV">
          <Download />
        </button>
      </div>
    </div>
  );
}

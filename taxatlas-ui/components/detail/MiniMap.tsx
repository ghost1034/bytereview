/* Locator mini-map (jurisdiction-detail.md): static SVG from the bundled TopoJSON (lib/geo.ts helpers), Mercator,
   cropped around the selected feature; selected fill --viz-seq-5 with a brass outline; siblings in --surface-3. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Geometry, Position } from "geojson";
import { loadUsStates, loadWorld, type GeoFC } from "@/taxatlas-ui/lib/geo";
import "./lists.css";

const W = 1000;
function project([lon, lat]: Position): [number, number] {
  const la = Math.max(-82, Math.min(82, lat));
  const x = ((lon + 180) / 360) * W;
  const y = (0.5 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / (2 * Math.PI)) * W;
  return [x, y];
}

function ringPath(ring: Position[]): string {
  return ring.map((p, i) => {
    const [x, y] = project(p);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join("") + "Z";
}

function geomPath(g: Geometry): string {
  if (g.type === "Polygon") return g.coordinates.map(ringPath).join("");
  if (g.type === "MultiPolygon") return g.coordinates.map((poly) => poly.map(ringPath).join("")).join("");
  return "";
}

function bbox(g: Geometry): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const visit = (ring: Position[]) =>
    ring.forEach((p) => {
      const [x, y] = project(p);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    });
  if (g.type === "Polygon") g.coordinates.forEach(visit);
  else if (g.type === "MultiPolygon") g.coordinates.forEach((poly) => poly.forEach(visit));
  else return null;
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

export function MiniMap({ layer, selectedKey, siblingKeys, caption, aspect = 1.8, cropBounds }: { layer: "world" | "us"; selectedKey: string | null; siblingKeys?: string[]; caption?: ReactNode; aspect?: number; /** [[west, south], [east, north]] override for features with far-flung parts (US). */ cropBounds?: [[number, number], [number, number]] }) {
  const [fc, setFc] = useState<GeoFC | null>(null);
  useEffect(() => {
    let alive = true;
    (layer === "us" ? loadUsStates() : loadWorld()).then((d) => alive && setFc(d));
    return () => {
      alive = false;
    };
  }, [layer]);

  const view = useMemo(() => {
    if (!fc) return null;
    const sel = fc.features.find((f) => f.properties.key === selectedKey);
    let box = sel ? bbox(sel.geometry) : null;
    if (cropBounds) {
      const [a, b] = [project([cropBounds[0][0], cropBounds[1][1]]), project([cropBounds[1][0], cropBounds[0][1]])];
      box = [a[0], a[1], b[0], b[1]];
    }
    if (!box) box = layer === "us" ? [project([-125, 50])[0], project([-125, 50])[1], project([-66, 24])[0], project([-66, 24])[1]] : [0, project([0, 75])[1], W, project([0, -55])[1]];
    let [x0, y0] = box;
    const [, , x1, y1] = box;
    // continent crop: pad to ~3× the feature, minimum span so microstates are still legible
    let w = Math.max(x1 - x0, 12);
    let h = Math.max(y1 - y0, 12 / aspect);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const factor = cropBounds ? 1.15 : sel ? (layer === "us" ? 3.2 : 2.8) : 1.05;
    w *= factor;
    h *= factor;
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    x0 = cx - w / 2;
    y0 = cy - h / 2;
    return { x0, y0, w, h, sel };
  }, [fc, selectedKey, layer, aspect, cropBounds]);

  return (
    <div className="ta-minimap" aria-label="Location" role="img">
      {fc && view && (
        <svg viewBox={`${view.x0.toFixed(1)} ${view.y0.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect x={view.x0 - 10} y={view.y0 - 10} width={view.w + 20} height={view.h + 20} fill="var(--map-ocean)" />
          <g className="land">
            {fc.features.map((f) => {
              const key = f.properties.key;
              if (key === selectedKey) return null;
              return <path key={key} className={siblingKeys?.includes(key) ? "sib" : undefined} d={geomPath(f.geometry)} />;
            })}
            {view.sel && <path className="sel" d={geomPath(view.sel.geometry)} />}
          </g>
          <g className="grat">
            {[-60, -30, 0, 30, 60].map((la) => {
              const y = project([0, la])[1];
              return <line key={la} x1={view.x0 - 10} x2={view.x0 + view.w + 10} y1={y} y2={y} />;
            })}
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lo) => {
              const x = project([lo, 0])[0];
              return <line key={lo} y1={view.y0 - 10} y2={view.y0 + view.h + 10} x1={x} x2={x} />;
            })}
          </g>
        </svg>
      )}
      {caption && <div className="cap">{caption}</div>}
    </div>
  );
}

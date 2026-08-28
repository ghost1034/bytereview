import { memo, useMemo } from "react";
import { Marker } from "react-map-gl/maplibre";
import type { ActivityPoint } from "@/taxatlas-ui/lib/types";
import { OVERLAY_DEFS, type OverlayKey } from "@/taxatlas-ui/lib/rates";
import { bubbleRadius, markerPath } from "./markers";

export interface OverlayHover {
  clientX: number;
  clientY: number;
  point: ActivityPoint;
  overlay: OverlayKey;
}

interface Props {
  overlay: OverlayKey;
  activity: ActivityPoint[];
  onHover: (h: OverlayHover | null) => void;
  onSelect: (code: string, name: string, overlay: OverlayKey) => void;
}

/** One activity overlay: a DOM SVG marker per country with a non-zero count, sized on a sqrt scale
 *  (3.5–26 px), 28 % fill + 1 px stroke in the overlay's categorical colour. Shape encodes the overlay
 *  (● changes, ▲ court decisions, ■ tariffs) so the three layers stay distinguishable when stacked. */
export const OverlayLayer = memo(function OverlayLayer({ overlay, activity, onHover, onSelect }: Props) {
  const def = OVERLAY_DEFS[overlay];
  const items = useMemo(() => {
    const pts = activity.filter((a) => a.lat != null && a.lon != null && a[def.field] > 0);
    const max = Math.max(0, ...pts.map((a) => a[def.field]));
    // Largest first so small marks stay on top and remain clickable.
    return pts.map((a) => ({ a, r: bubbleRadius(a[def.field], max) })).sort((x, y) => y.r - x.r);
  }, [activity, def.field]);

  return (
    <>
      {items.map(({ a, r }) => {
        const size = Math.ceil(r * 2.4) + 2;
        return (
          <Marker key={a.code} longitude={a.lon as number} latitude={a.lat as number} anchor="center" style={{ zIndex: 1 }}>
            <svg
              width={size}
              height={size}
              viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
              role="img"
              aria-label={`${a.name}: ${a[def.field]} ${def.noun}`}
              style={{ display: "block", cursor: "pointer", overflow: "visible" }}
              onMouseMove={(e) => onHover({ clientX: e.clientX, clientY: e.clientY, point: a, overlay })}
              onMouseLeave={() => onHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(a.code, a.name, overlay);
              }}
            >
              <path d={markerPath(def.marker, r)} fill={`var(${def.colorVar})`} fillOpacity={0.28} stroke={`var(${def.colorVar})`} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
          </Marker>
        );
      })}
    </>
  );
});

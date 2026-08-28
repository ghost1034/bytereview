import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import MapGL, { Layer, Source, type MapLayerMouseEvent, type MapRef } from "react-map-gl/maplibre";
import type { ExpressionSpecification, Map as MlMap, MapStyleImageMissingEvent } from "maplibre-gl";
import type { FeatureCollection, Geometry, MultiLineString, Position } from "geojson";
import type { ActivityPoint, ChoroplethPoint } from "@/taxatlas-ui/lib/types";
import { binIndex, rampIndices, type GeoFC, type JoinField } from "@/taxatlas-ui/lib/geo";
import { OVERLAY_DEFS, OVERLAY_KEYS, type OverlayKey } from "@/taxatlas-ui/lib/rates";
import type { MapPalette } from "./colors";
import { HATCH_ID, IMG_PIXEL_RATIO, hatchImage } from "./markers";
import { OverlayLayer, type OverlayHover } from "./OverlayLayer";

/* The style is empty on purpose: no tiles, no glyphs, no API key. Land comes from bundled TopoJSON (lib/geo.ts)
 * and every colour is a design token resolved at runtime (colors.ts), so the canvas re-themes with the DOM. */
const EMPTY_STYLE = { version: 8 as const, sources: {}, layers: [] };

interface ShadedProps {
  name: string;
  key: string;
  code: string | null;
  value: number | null;
  label: string | null;
  /** Legend bin index, or -1 when the jurisdiction has no value for the metric. */
  bin: number;
}
type ShadedFC = FeatureCollection<Geometry, ShadedProps>;

export interface HoverInfo {
  /** Container-relative pointer position. */
  x: number;
  y: number;
  name: string;
  code: string | null;
  value: number | null;
  label: string | null;
  /** Overlay bubbles: "603 changes in 30 d". */
  extra?: string;
}

export interface WorldMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

interface Props {
  geo: GeoFC | null;
  points: ChoroplethPoint[] | undefined;
  /** Which choropleth field matches GeoProps.key: iso_numeric (world), code (admin-1 ISO 3166-2), fips (legacy). */
  joinField: JoinField;
  /** Lower edges of the legend bins (lib/geo.ts computeBins). */
  ticks: number[];
  palette: MapPalette;
  activity: ActivityPoint[] | undefined;
  overlays: Record<OverlayKey, boolean>;
  selectedCode: string | null;
  bounds: [[number, number], [number, number]];
  /** Pixel padding reserved for UI chrome (left rail, right drawer, controls). */
  padding: { top: number; bottom: number; left: number; right: number };
  onSelect: (code: string, name: string, overlay?: OverlayKey) => void;
  onHover: (h: HoverInfo | null) => void;
}

/** 30° graticule, drawn under the land as a faint reference grid (atlas convention). */
const GRATICULE: FeatureCollection<MultiLineString> = (() => {
  const lines: Position[][] = [];
  for (let lon = -180; lon <= 180; lon += 30) lines.push([[lon, -85], [lon, 85]]);
  for (let lat = -60; lat <= 60; lat += 30) {
    const ring: Position[] = [];
    for (let lon = -180; lon <= 180; lon += 5) ring.push([lon, lat]);
    lines.push(ring);
  }
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } }] };
})();

export const WorldMap = forwardRef<WorldMapHandle, Props>(function WorldMap(
  { geo, points, joinField, ticks, palette, activity, overlays, selectedCode, bounds, padding, onSelect, onHover },
  ref,
) {
  const mapRef = useRef<MapRef | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [cursor, setCursor] = useState("grab");
  const dragging = useRef(false);
  const loaded = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // Join API points to GeoJSON features and classify each into a legend bin. Colours are applied by a
  // `match` expression on the bin index (pages/map.md performance note), not per-feature colour strings.
  const { shaded, codeToKey } = useMemo(() => {
    const codeToKey = new Map<string, string>();
    if (!geo) return { shaded: null as ShadedFC | null, codeToKey };
    const pad = (k: string) => (joinField === "code" ? k : joinField === "fips" ? k.padStart(2, "0") : k.padStart(3, "0"));
    const byKey = new Map<string, ChoroplethPoint>();
    (points ?? []).forEach((p) => {
      const k = p[joinField];
      if (k) byKey.set(pad(String(k)), p);
    });
    const fc: ShadedFC = {
      type: "FeatureCollection",
      features: geo.features.map((f) => {
        const key = pad(f.properties.key);
        // Admin-1 features may carry legacy codes (NE's IN-CT for IN-CG); either side of the remap joins.
        const p = byKey.get(key) ?? f.properties.alt?.map((a) => byKey.get(a)).find((x) => x !== undefined);
        if (p) codeToKey.set(p.code, key);
        return {
          type: "Feature",
          id: f.id,
          geometry: f.geometry,
          properties: {
            name: p?.name ?? f.properties.name,
            key,
            code: p?.code ?? null,
            value: p?.value ?? null,
            label: p?.label ?? null,
            bin: p && p.value != null && ticks.length > 0 ? binIndex(p.value, ticks) : -1,
          },
        };
      }),
    };
    return { shaded: fc, codeToKey };
  }, [geo, points, joinField, ticks]);

  const fillColor = useMemo<ExpressionSpecification | string>(() => {
    const k = ticks.length;
    if (k === 0) return palette.nodataFill;
    const idx = rampIndices(k, palette.seq.length);
    const cases: Array<number | string> = [];
    idx.forEach((ri, i) => cases.push(i, palette.seq[ri]));
    return ["match", ["get", "bin"], ...cases, palette.nodataFill] as unknown as ExpressionSpecification;
  }, [ticks, palette]);

  const selectedKey = selectedCode ? (codeToKey.get(selectedCode) ?? null) : null;

  // --- Theme-coloured raster images (hatch) -------------------------------------------------------------
  const ensureImages = useCallback(
    (m: MlMap) => {
      const img = hatchImage(palette.nodataFill, palette.nodataHatch);
      if (m.hasImage(HATCH_ID)) m.updateImage(HATCH_ID, img);
      else m.addImage(HATCH_ID, img, { pixelRatio: IMG_PIXEL_RATIO });
    },
    [palette],
  );
  useEffect(() => {
    const m = mapRef.current?.getMap();
    if (m && loaded.current) ensureImages(m);
  }, [ensureImages]);

  // --- Camera ---------------------------------------------------------------------------------------------
  // Fit to the active bounds whenever they, the chrome padding, or the window size change (world ↔ drill,
  // drawer open/close). Resize first and run after layout so the container has its final dimensions.
  const fit = useCallback(
    (animate: boolean) => {
      const m = mapRef.current;
      if (!m) return;
      requestAnimationFrame(() => {
        m.resize();
        m.fitBounds(bounds, { padding, duration: animate ? 600 : 0 });
      });
    },
    [bounds, padding],
  );
  useEffect(() => {
    fit(true);
  }, [fit]);
  useEffect(() => {
    const onResize = () => fit(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fit]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn({ duration: 200 }),
      zoomOut: () => mapRef.current?.zoomOut({ duration: 200 }),
      reset: () => fit(true),
    }),
    [fit],
  );

  // --- Pointer ---------------------------------------------------------------------------------------------
  // DOM overlay markers sit inside the canvas container, so MapLibre also sees their pointer events; the
  // marker's own handlers own hover/click there.
  const overMarker = (e: MapLayerMouseEvent) => !!(e.originalEvent.target as Element | null)?.closest?.(".maplibregl-marker");

  const onMove = useCallback(
    (e: MapLayerMouseEvent) => {
      if (dragging.current || overMarker(e)) return;
      const f = e.features?.[0];
      if (!f) {
        setHoverKey(null);
        setCursor("grab");
        onHover(null);
        return;
      }
      const p = f.properties as ShadedProps;
      setCursor(p.code ? "pointer" : "grab");
      setHoverKey(p.key);
      onHover({ x: e.point.x, y: e.point.y, name: p.name, code: p.code, value: p.value, label: p.label });
    },
    [onHover],
  );

  const clearHover = useCallback(() => {
    setHoverKey(null);
    onHover(null);
  }, [onHover]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (overMarker(e)) return;
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties as ShadedProps;
      if (p.code) onSelect(p.code, p.name);
    },
    [onSelect],
  );

  const onOverlayHover = useCallback(
    (h: OverlayHover | null) => {
      if (!h) {
        onHover(null);
        return;
      }
      const rect = wrapRef.current?.getBoundingClientRect();
      const def = OVERLAY_DEFS[h.overlay];
      onHover({
        x: h.clientX - (rect?.left ?? 0),
        y: h.clientY - (rect?.top ?? 0),
        name: h.point.name,
        code: h.point.code,
        value: null,
        label: null,
        extra: `${h.point[def.field]} ${def.noun}`,
      });
    },
    [onHover],
  );

  // If a layer referencing the pattern is added before the image (mount order), supply it on demand.
  const onStyleImageMissing = useCallback(
    (e: MapStyleImageMissingEvent) => {
      const m = mapRef.current?.getMap();
      if (m && e.id === HATCH_ID && !m.hasImage(HATCH_ID)) ensureImages(m);
    },
    [ensureImages],
  );
  useEffect(() => {
    const m = mapRef.current?.getMap();
    if (!m) return;
    m.on("styleimagemissing", onStyleImageMissing);
    return () => {
      m.off("styleimagemissing", onStyleImageMissing);
    };
  }, [onStyleImageMissing, mapReady]);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      <MapGL
        ref={mapRef}
        mapStyle={EMPTY_STYLE}
        initialViewState={{ bounds, fitBoundsOptions: { padding } }}
        onLoad={(e) => {
          loaded.current = true;
          ensureImages(e.target);
          setMapReady(true);
          fit(false);
        }}
        minZoom={1}
        maxZoom={8}
        attributionControl={false}
        interactiveLayerIds={shaded ? ["fill-data", "fill-nodata"] : []}
        cursor={cursor}
        onMouseMove={onMove}
        onMouseLeave={clearHover}
        onDragStart={() => {
          dragging.current = true;
          clearHover();
        }}
        onDragEnd={() => {
          dragging.current = false;
        }}
        onClick={onClick}
        style={{ width: "100%", height: "100%" }}
        // Single world copy: MapLibre then clamps zoom so the world spans the full container width, which means
        // in world mode the rail covers the far-west Pacific (acceptable) instead of showing a duplicate
        // Australia under the legend. Padding still governs the drilled (zoomed-in) views.
        renderWorldCopies={false}
      >
        <Layer id="bg" type="background" paint={{ "background-color": palette.ocean }} />
        <Source id="graticule" type="geojson" data={GRATICULE}>
          <Layer id="graticule" type="line" paint={{ "line-color": palette.graticule, "line-width": 1 }} />
        </Source>
        {/* Gated on mapReady: `fill-nodata` references the hatch image, which onLoad registers; adding the layer
            first makes MapLibre warn "Image hatch could not be loaded" (geometry is cached on repeat visits). */}
        {shaded && mapReady && (
          <Source id="shaded" type="geojson" data={shaded}>
            <Layer id="fill-data" type="fill" filter={[">=", ["get", "bin"], 0]} paint={{ "fill-color": fillColor, "fill-opacity": 1, "fill-antialias": false }} />
            <Layer id="fill-nodata" type="fill" filter={["<", ["get", "bin"], 0]} paint={{ "fill-pattern": HATCH_ID, "fill-opacity": 1 }} />
            <Layer
              id="outline"
              type="line"
              paint={{
                "line-color": ["case", ["<", ["get", "bin"], 0], palette.nodataLine, palette.outline],
                "line-width": 0.6,
              }}
            />
            <Layer id="hover" type="line" filter={["==", ["get", "key"], hoverKey ?? "__none__"]} paint={{ "line-color": palette.outlineHover, "line-width": 1.2 }} />
            <Layer id="selected" type="line" filter={["==", ["get", "key"], selectedKey ?? "__none__"]} paint={{ "line-color": palette.outlineSelected, "line-width": 1.6 }} />
          </Source>
        )}
        {activity && OVERLAY_KEYS.map((k) => (overlays[k] ? <OverlayLayer key={k} overlay={k} activity={activity} onHover={onOverlayHover} onSelect={onSelect} /> : null))}
      </MapGL>
    </div>
  );
});

import type { MetricDef } from "@/taxatlas-ui/lib/rates";
import type { HoverInfo } from "./WorldMap";

/** Hover tooltip: name · mono value with unit · mono code. Follows the pointer with a 12 px offset and flips to
 *  the left/top when it would run off the map container. */
export function MapTooltip({ hover, metric, size }: { hover: HoverInfo; metric: MetricDef | null; size: { w: number; h: number } }) {
  const flipX = size.w > 0 && hover.x > size.w - 260;
  const flipY = size.h > 0 && hover.y > size.h - 60;
  const style = {
    left: flipX ? undefined : hover.x + 12,
    right: flipX ? size.w - hover.x + 12 : undefined,
    top: flipY ? undefined : hover.y + 12,
    bottom: flipY ? size.h - hover.y + 12 : undefined,
  };
  return (
    <div className="mp-tip" role="tooltip" style={style}>
      <span>{hover.name}</span>
      {hover.extra ? (
        <span className="v">{hover.extra}</span>
      ) : hover.value != null ? (
        <Value label={hover.label} value={hover.value} />
      ) : hover.code ? (
        <span className="none">{metric ? `no ${metric.short} rate tracked` : "no sub-national rates tracked"}</span>
      ) : (
        <span className="none">not tracked</span>
      )}
      {hover.code && <span className="c">{hover.code}</span>}
    </div>
  );
}

function Value({ label, value }: { label: string | null; value: number }) {
  // The API label is authoritative ("20%", "100,000 USD"); split a trailing unit so it can be set smaller.
  const text = label ?? String(value);
  const m = text.match(/^(.*?)\s*(%|[A-Z]{3})$/);
  if (!m) return <span className="v">{text}</span>;
  return (
    <span className="v">
      {m[1]}
      <small>{m[2]}</small>
    </span>
  );
}

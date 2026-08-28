/* Sparklines: the line variant is the ui primitive; `SparkBars` (items per run) is WP-C local. */
import "./lists.css";
export { Sparkline } from "@/taxatlas-ui/components/ui/StatStrip";

export function SparkBars({ values, width = 48, height = 16, title, className }: { values: number[]; width?: number; height?: number; title?: string; className?: string }) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const gap = 1;
  const bw = Math.max(1, (width - gap * (values.length - 1)) / values.length);
  const t = title ?? `${values.length} runs · last ${values[values.length - 1]}`;
  return (
    <svg className={className ? `ta-bars ${className}` : "ta-bars"} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t} style={{ width, height }}>
      <title>{t}</title>
      {values.map((v, i) => {
        const h = v === 0 ? 1 : Math.max(1, (v / max) * height);
        return <rect key={i} className={v === 0 ? "zero" : undefined} x={i * (bw + gap)} y={height - h} width={bw} height={h} />;
      })}
    </svg>
  );
}

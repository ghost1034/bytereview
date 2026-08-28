import { cn } from "@/taxatlas-ui/lib/utils";

/** Static skeleton bar (surface-2, no shimmer). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton w-full", className)} />;
}

const WIDTHS = ["w-[60%]", "w-[35%]", "w-[80%]", "w-[45%]", "w-[70%]"];

/** 8 static rows at 60/35/80 % widths; header (if any) is rendered by the caller. */
export function TableSkeleton({ rows = 8, cols = 3, dense }: { rows?: number; cols?: number; dense?: boolean }) {
  return (
    <div aria-hidden="true" className="px-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className={cn("flex items-center gap-6 border-b border-hairline last:border-b-0", dense ? "h-[30px]" : "h-[38px]")}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-2.5", WIDTHS[(r + c) % WIDTHS.length])} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Block placeholder reserving a fixed height (charts, maps). */
export function SkeletonBlock({ height = 180, className }: { height?: number; className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton w-full rounded-md", className)} style={{ height }} />;
}

/** Route-level Suspense fallback. Quiet text; spinners are reserved for > 1 s mutations. */
export function PageSpinner() {
  return (
    <div role="status" className="grid min-h-[40vh] place-items-center text-sm text-ink-3">
      Loading…
    </div>
  );
}

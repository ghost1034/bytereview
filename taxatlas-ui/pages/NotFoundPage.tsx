import type { ReactNode } from "react";
import { Link, useLocation } from "@/taxatlas-ui/lib/navigation";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { openPalette } from "@/taxatlas-ui/components/CommandPalette";
import { Kbd, MOD } from "@/taxatlas-ui/components/ui/Kbd";

const ROUTES = ["map", "overview", "jurisdictions", "regulations", "court-decisions", "tariffs", "changes", "sources", "account"];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

/** One suggestion at most: the first path segment within Levenshtein ≤ 2 of a known route, rest of the path kept. */
export function suggestRoute(pathname: string): string | null {
  const segs = pathname.split("/").filter(Boolean);
  if (!segs.length) return null;
  const head = segs[0].toLowerCase();
  let best: { r: string; d: number } | null = null;
  for (const r of ROUTES) {
    const d = levenshtein(head, r);
    if (d <= 2 && (!best || d < best.d)) best = { r, d };
  }
  if (!best || best.r === head) return null;
  return "/" + [best.r, ...segs.slice(1)].join("/");
}

/** Typeset like the rest of the atlas: serif headline, one sentence, one action (pages/errors.md). */
export function NotFound({ headline, sentence, suggestion, actions }: { headline: string; sentence: ReactNode; suggestion?: string | null; actions?: ReactNode }) {
  return (
    <div className="page-inner">
      <div className="mt-[100px] max-w-[56ch]">
        <h1 className="serif text-3xl text-ink-1">{headline}</h1>
        <p className="mt-3 text-base text-ink-2">{sentence}</p>
        {suggestion && (
          <p className="mt-2 text-base text-ink-2">
            Did you mean <Link to={suggestion} className="mono">{suggestion}</Link>?
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          {actions ?? (
            <>
              <Link to="/map" className="btn btn-primary">
                Go to map
              </Link>
              <button type="button" className="btn btn-ghost" onClick={() => openPalette()}>
                Search <Kbd className="ml-1">{MOD}K</Kbd>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotFoundPage() {
  usePageTitle("Not found");
  const loc = useLocation();
  return (
    <NotFound
      headline="Not on the map."
      sentence={
        <>
          There is no page at <span className="mono text-ink-1">{loc.pathname}</span>.
        </>
      }
      suggestion={suggestRoute(loc.pathname)}
    />
  );
}

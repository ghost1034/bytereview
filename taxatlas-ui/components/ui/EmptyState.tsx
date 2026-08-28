import type { ReactNode } from "react";
import { ApiError } from "@/taxatlas-ui/lib/api";
import { Button } from "./Button";
import { errorMessage } from "./Toast";

/** One sentence + one action. No illustration. */
export function EmptyState({ title = "Nothing here yet.", hint, action, className }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={className ?? "tbl-slot"}>
      <div className="flex max-w-[56ch] flex-col items-center gap-2">
        <p>{title}</p>
        {hint && <p className="text-xs text-ink-3">{hint}</p>}
        {action}
      </div>
    </div>
  );
}

/** "Could not load {what} (HTTP 502)." + Retry. Status is mono. */
export function ErrorState({ error, onRetry, what = "data", className }: { error: unknown; onRetry?: () => void; what?: string; className?: string }) {
  const status = error instanceof ApiError && error.status ? error.status : null;
  return (
    <div role="alert" className={className ?? "tbl-slot"}>
      <div className="flex max-w-[56ch] flex-col items-center gap-2">
        <p>
          Could not load {what}
          {status ? (
            <>
              {" "}
              (HTTP <span className="mono">{status}</span>)
            </>
          ) : null}
          .
        </p>
        <p className="text-xs text-ink-3">{errorMessage(error)}</p>
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

/* Watch / Watching toggle for a jurisdiction (+ optional tax type). Labels kept exact for the E2E contract. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { useToast } from "@/taxatlas-ui/components/ui/Toast";
import "./lists.css";

export function useWatch(code: string | null | undefined, taxType?: string | null) {
  const qc = useQueryClient();
  const toast = useToast();
  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.account.watchlist, enabled: !!code });
  const watched = code ? watchlist.data?.find((w) => w.jurisdiction_code?.toUpperCase() === code.toUpperCase() && (w.tax_type ?? null) === (taxType ?? null)) : undefined;
  const toggle = useMutation({
    mutationFn: async (): Promise<unknown> => {
      if (!code) return;
      return watched ? api.account.removeWatch(watched.id) : api.account.addWatch({ jurisdiction_code: code, tax_type: taxType ?? null, include_children: true });
    },
    onSuccess: () => {
      toast.success(watched ? "Removed from watchlist" : "Watching jurisdiction");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: (e) => toast.error(e),
  });
  return { watched: !!watched, toggle, pending: toggle.isPending, ready: !!code };
}

export function WatchButton({ code, taxType, primary, long, className }: { code: string | null | undefined; taxType?: string | null; primary?: boolean; long?: boolean; className?: string }) {
  const w = useWatch(code, taxType);
  if (!code) return null;
  const cls = ["btn", primary && !w.watched ? "btn-primary" : "", !primary ? "btn-ghost" : "", className ?? ""].filter(Boolean).join(" ");
  const text = w.watched ? (long ? "Watching jurisdiction" : "Watching") : long ? "Watch jurisdiction" : "Watch";
  return (
    <button type="button" className={cls} aria-busy={w.pending || undefined} disabled={w.pending} onClick={() => w.toggle.mutate()} aria-pressed={w.watched} title={w.watched ? `Stop watching ${code}` : `Watch ${code}: notifications on new changes`}>
      {text}
    </button>
  );
}

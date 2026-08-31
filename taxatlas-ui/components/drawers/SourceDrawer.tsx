/* Source detail: source metadata, effective batch schedule, last run / success,
   failures, items, last error, and run history. Admin: enable/disable with confirm. */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { fmtDateTime, fmtInt } from "@/taxatlas-ui/lib/format";
import { TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import type { SourceOut } from "@/taxatlas-ui/lib/types";
import { copyText } from "@/taxatlas-ui/lib/utils";
import { DetailPanel, Kv, Prose, type PanelMode } from "@/taxatlas-ui/components/detail/DetailPanel";
import { StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef, SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { Bilingual } from "@/taxatlas-ui/components/ui/Bilingual";
import { useSourceSchedules } from '@/taxatlas-ui/hooks/useSourceSchedules';
import { formatScheduleTime, scheduleForSource, sourceScheduleLabel } from '@/taxatlas-ui/lib/schedules';

export function SourceDrawer({ source, onClose, mode = "push", isAdmin, onToggle, onCrawl, busy }: { source: SourceOut | null; onClose: () => void; mode?: PanelMode; isAdmin?: boolean; onToggle?: (s: SourceOut) => void; onCrawl?: (s: SourceOut) => void; busy?: boolean }) {
  const s = source;
  const schedules = useSourceSchedules();
  const scheduleData = schedules.isError ? undefined : schedules.data;
  const schedule = s ? scheduleForSource(s, scheduleData) : undefined;
  const [confirm, setConfirm] = useState(false);
  // ↑/↓ swap the source behind an open drawer; a pending Disable/Enable confirmation must not carry over.
  useEffect(() => setConfirm(false), [s?.id]);
  const runs = useQuery({
    queryKey: ["source-runs", { source_id: s?.id, limit: 50 }],
    queryFn: () => api.sources.runs({ source_id: s!.id, limit: 50 }),
    enabled: !!s,
    refetchInterval: 15_000,
  });
  return (
    <DetailPanel
      mode={mode}
      open={!!s}
      onClose={onClose}
      label="Source detail"
      idLine={
        s && (
          <>
            <span className="code">{s.slug}</span>
            <span>{label({}, s.category)} · {s.adapter}</span>
            <StatusMarker value={s.enabled ? s.last_status ?? "pending" : "disabled"} tone={s.enabled ? undefined : "neutral"} text={s.enabled ? undefined : "disabled"} />
          </>
        )
      }
      title={s ? <span dir="auto">{s.name}</span> : undefined}
      foot={
        s && (
          <>
            <a className="btn" href={s.url} target="_blank" rel="noreferrer">Open source ↗</a>
            {isAdmin && onCrawl && (
              <button type="button" className="btn btn-ghost" aria-busy={busy || undefined} disabled={busy || !s.enabled} onClick={() => onCrawl(s)} title={s.enabled ? (scheduleData?.mode === 'cloud_run' ? 'Run all enabled sources in this adapter batch' : 'Queue a crawl now') : "Enable the source first"}>
                {scheduleData?.mode === 'cloud_run' ? 'Run batch now' : 'Run now'}
              </button>
            )}
            {isAdmin && onToggle && !confirm && (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(true)}>
                {s.enabled ? "Disable" : "Enable"}
              </button>
            )}
            {isAdmin && onToggle && confirm && (
              <span className="ta-confirm">
                {s.enabled ? "Disable" : "Enable"} <span className="code">{s.slug}</span>?
                <button type="button" className="btn btn-sm" onClick={() => { onToggle(s); setConfirm(false); }}>Confirm</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Keep</button>
              </span>
            )}
          </>
        )
      }
    >
      {s && (
        <>
          <Kv
            rows={[
              ["Slug", <span className="mono">{s.slug} <button type="button" className="ta-link-btn" onClick={() => copyText(s.slug)}>copy</button></span>],
              ["URL", <SourceLink href={s.url} full />],
              ["Authority", <Bilingual original={s.authority} translation={s.authority_en} />],
              ["Jurisdiction", <JRef j={s.jurisdiction} />],
              ["Tax types", (s.tax_types ?? []).map((t) => label(TAX_TYPE_LABEL, t)).join(" · ") || null],
              ["Adapter", s.adapter, { mono: true }],
              ["Batch schedule", schedules.isLoading && s.enabled ? 'Loading…' : sourceScheduleLabel(s, scheduleData)],
              ["Next scheduled batch", formatScheduleTime(s.enabled && scheduleData?.mode === 'cloud_run' ? schedule?.next_run_at : null), { mono: true }],
              ["Last run", fmtDateTime(s.last_run_at), { mono: true }],
              ["Last success", fmtDateTime(s.last_success_at), { mono: true }],
              ["Failures", s.consecutive_failures > 0 ? `${s.consecutive_failures} consecutive` : "0", { mono: true }],
              ["Items total", fmtInt(s.items_total), { mono: true }],
            ]}
          />
          {s.last_error && (
            <Prose title="Last error">
              <pre>{s.last_error}</pre>
            </Prose>
          )}
          <div className="ta-sect">
            <h3>Run history <span className="ta-pill">{runs.data?.total ?? "…"}</span></h3>
            {runs.isLoading && <span className="ta-sk" style={{ width: "60%", display: "block" }} aria-hidden="true" />}
            {runs.data && runs.data.items.length === 0 && <div className="ta-empty">No runs recorded.</div>}
            {runs.data?.items.map((r) => {
              const dur = r.finished_at ? Math.max(0, (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
              return (
                <div key={r.id} className="ta-ev" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                  <span className="when">{fmtDateTime(r.started_at)}</span>
                  <span className="t">
                    <StatusMarker value={r.status} />{" "}
                    <span className="ta-faint mono" style={{ fontSize: "var(--text-xs)" }}>
                      fetched {r.items_found} · new {r.items_new} · changed {r.items_changed}
                      {r.http_status ? ` · HTTP ${r.http_status}` : ""}
                    </span>
                    {r.error && <span className="sub" style={{ display: "block", color: "var(--negative)", fontSize: "var(--text-xs)" }}>{r.error}</span>}
                  </span>
                  <span className="when">{dur == null ? "…" : `${dur.toFixed(1)} s`}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </DetailPanel>
  );
}

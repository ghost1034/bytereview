/* Source detail (pages/sources.md): name, slug (copy), URL, authority, jurisdiction, tax types, adapter, cron with a human
   reading, last run / success, failures, items, last error in a code block, run history (last 50). Admin: enable/disable with confirm. */
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

export function cronToWords(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;
  const hh = hour.includes("*") ? null : hour.padStart(2, "0");
  const mm = min.includes("*") ? null : min.padStart(2, "0");
  if (hour.startsWith("*/")) return `every ${hour.slice(2)} h`;
  if (min.startsWith("*/") && hour === "*") return `every ${min.slice(2)} min`;
  const time = hh != null && mm != null ? `${hh}:${mm} UTC` : "";
  if (dow !== "*" && dom === "*") {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days = dow.split(",").map((d) => names[Number(d) % 7] ?? d).join(", ");
    return `weekly ${days} ${time}`.trim();
  }
  if (dom !== "*") return `monthly on day ${dom} ${time}`.trim();
  return `daily ${time}`.trim();
}

export function SourceDrawer({ source, onClose, mode = "push", isAdmin, onToggle, onCrawl, busy }: { source: SourceOut | null; onClose: () => void; mode?: PanelMode; isAdmin?: boolean; onToggle?: (s: SourceOut) => void; onCrawl?: (s: SourceOut) => void; busy?: boolean }) {
  const s = source;
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
              <button type="button" className="btn btn-ghost" aria-busy={busy || undefined} disabled={busy || !s.enabled} onClick={() => onCrawl(s)} title={s.enabled ? "Queue a crawl now" : "Enable the source first"}>
                Run now
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
              ["Schedule", <><span className="mono">{s.schedule_cron}</span> <span className="ta-faint">· {cronToWords(s.schedule_cron)}</span></>],
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

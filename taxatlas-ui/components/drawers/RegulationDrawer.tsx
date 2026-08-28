import { useQuery } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { fmtDate, fmtDateTime } from "@/taxatlas-ui/lib/format";
import { TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import { DetailPanel, Kv, PanelSkeleton, Prose, type PanelMode } from "@/taxatlas-ui/components/detail/DetailPanel";
import { StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef, SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { ChangeHistory } from "@/taxatlas-ui/components/detail/ChangeHistory";
import { WatchButton } from "@/taxatlas-ui/components/detail/WatchButton";
import { Bilingual, BilingualProse, BilingualTitle, LangTag } from "@/taxatlas-ui/components/ui/Bilingual";
import { authorityEn, langName } from "@/taxatlas-ui/lib/i18n";

export interface RecordDrawerProps {
  id: number | null;
  onClose: () => void;
  mode?: PanelMode;
  onPrev?: () => void;
  onNext?: () => void;
}

export function RegulationDrawer({ id, onClose, mode = "push", onPrev, onNext }: RecordDrawerProps) {
  const q = useQuery({ queryKey: ["regulation", id], queryFn: () => api.regulations.get(id!), enabled: id != null });
  const r = q.data;
  // The English authority name lives on the crawler source (authority_en); regulations only carry source_id.
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => api.sources.list(), staleTime: 300_000, enabled: r?.source_id != null });
  const src = r?.source_id != null ? sources.data?.find((s) => s.id === r.source_id) : undefined;
  return (
    <DetailPanel
      mode={mode}
      open={id != null}
      onClose={onClose}
      label="Regulation detail"
      idLine={
        <>
          <span className="code">REG-{String(id ?? 0).padStart(4, "0")}</span>
          <span>Regulation{r ? ` · ${label({}, r.doc_type)}` : ""}</span>
          {r && <StatusMarker value={r.status} />}
          {r && <LangTag lang={r.lang} />}
        </>
      }
      title={r ? <BilingualTitle original={r.title} lang={r.lang} translation={r.title_en} /> : q.isLoading ? "Loading…" : "Regulation"}
      onPrev={onPrev}
      onNext={onNext}
      foot={
        r && (
          <>
            {r.source_url && (
              <a className="btn" href={r.source_url} target="_blank" rel="noreferrer">
                Open source ↗
              </a>
            )}
            <WatchButton code={r.jurisdiction?.code} long />
          </>
        )
      }
    >
      {q.isLoading && <PanelSkeleton />}
      {q.isError && <Prose>Could not load this regulation ({(q.error as { status?: number }).status ?? "network"}). <button type="button" className="ta-link-btn" onClick={() => q.refetch()}>Retry</button></Prose>}
      {r && (
        <>
          <div className="ta-sect" style={{ paddingBottom: 0, borderBottom: 0 }}>
            <h3>Overview</h3>
          </div>
          <Kv
            rows={[
              ["Jurisdiction", <JRef j={r.jurisdiction} />],
              ["Authority", <Bilingual original={r.authority} translation={authorityEn(r, src)} showMissing={false} />],
              ["Tax type", label(TAX_TYPE_LABEL, r.tax_type)],
              ...(r.lang ? ([["Language", <><span dir="auto">{langName(r.lang)}</span> <span className="ta-faint mono">{r.lang}</span></>]] as Array<[string, React.ReactNode]>) : []),
              ["Published", fmtDate(r.published_date), { mono: true }],
              ["Effective", fmtDate(r.effective_date), { mono: true }],
              ["Reference", r.reference, { mono: true }],
              ["Source", <SourceLink href={r.source_url} full />],
              ["Seen", <>first {fmtDateTime(r.first_seen_at)} · last {fmtDateTime(r.last_seen_at)}</>, { mono: true }],
            ]}
          />
          {r.summary && (
            <Prose title="Summary">
              <BilingualProse original={r.summary} lang={r.lang} translation={r.summary_en} />
            </Prose>
          )}
          {r.body_excerpt && (
            <Prose title="Excerpt">
              <p lang={r.lang || undefined} dir="auto" style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{r.body_excerpt}</p>
            </Prose>
          )}
          {r.tags && r.tags.length > 0 && (
            <Prose title="Tags">
              <p className="ta-muted">{r.tags.join(", ")}</p>
            </Prose>
          )}
          <ChangeHistory entityType="regulation" entityId={r.id} />
        </>
      )}
    </DetailPanel>
  );
}

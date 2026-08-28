import { useQuery } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { fmtDate } from "@/taxatlas-ui/lib/format";
import { TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import { DetailPanel, Kv, PanelSkeleton, Prose } from "@/taxatlas-ui/components/detail/DetailPanel";
import { SignificanceMark, StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef, SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { ChangeHistory } from "@/taxatlas-ui/components/detail/ChangeHistory";
import { WatchButton } from "@/taxatlas-ui/components/detail/WatchButton";
import type { RecordDrawerProps } from "./RegulationDrawer";
import { BilingualProse, BilingualTitle, LangTag } from "@/taxatlas-ui/components/ui/Bilingual";
import { langName } from "@/taxatlas-ui/lib/i18n";

export function CourtDecisionDrawer({ id, onClose, mode = "push", onPrev, onNext }: RecordDrawerProps) {
  const q = useQuery({ queryKey: ["court-decision", id], queryFn: () => api.courtDecisions.get(id!), enabled: id != null });
  const d = q.data;
  return (
    <DetailPanel
      mode={mode}
      open={id != null}
      onClose={onClose}
      label="Court decision detail"
      idLine={
        <>
          <span className="code">CASE-{String(id ?? 0).padStart(4, "0")}</span>
          {d && <SignificanceMark level={d.significance} />}
          {d && <StatusMarker value={d.outcome} />}
          {d && <LangTag lang={d.lang} />}
        </>
      }
      title={d ? <BilingualTitle original={d.case_name} lang={d.lang} translation={d.case_name_en} /> : q.isLoading ? "Loading…" : "Court decision"}
      onPrev={onPrev}
      onNext={onNext}
      foot={
        d && (
          <>
            <a className="btn" href={d.source_url} target="_blank" rel="noreferrer">
              Open source ↗
            </a>
            <WatchButton code={d.jurisdiction?.code} long />
          </>
        )
      }
    >
      {q.isLoading && <PanelSkeleton />}
      {q.isError && <Prose>Could not load this decision ({(q.error as { status?: number }).status ?? "network"}). <button type="button" className="ta-link-btn" onClick={() => q.refetch()}>Retry</button></Prose>}
      {d && (
        <>
          <div className="ta-sect" style={{ paddingBottom: 0, borderBottom: 0 }}>
            <h3>Overview</h3>
          </div>
          <Kv
            rows={[
              ["Court", <span lang={d.lang || undefined} dir="auto">{d.court}</span>],
              ...(d.lang ? ([["Language", <><span>{langName(d.lang)}</span> <span className="ta-faint mono">{d.lang}</span></>]] as Array<[string, React.ReactNode]>) : []),
              ["Docket", d.docket, { mono: true }],
              ["Citation", d.citation, { mono: true }],
              ["Decided", fmtDate(d.decision_date), { mono: true }],
              ["Jurisdiction", <JRef j={d.jurisdiction} />],
              ["Tax types", (d.tax_types ?? []).map((t) => label(TAX_TYPE_LABEL, t)).join(" · ") || null],
              ["Significance", <SignificanceMark level={d.significance} />],
              ["Outcome", <StatusMarker value={d.outcome} />],
              ["Source", <SourceLink href={d.source_url} full />],
            ]}
          />
          {d.summary && (
            <Prose title="Summary">
              <BilingualProse original={d.summary} lang={d.lang} translation={d.summary_en} />
            </Prose>
          )}
          {d.holding && (
            <Prose title="Holding">
              <BilingualProse original={d.holding} lang={d.lang} translation={d.holding_en} originalClassName="holding" />
            </Prose>
          )}
          {d.tags && d.tags.length > 0 && (
            <Prose title="Tags">
              <p className="ta-muted">{d.tags.join(", ")}</p>
            </Prose>
          )}
          <ChangeHistory entityType="court_decision" entityId={d.id} />
        </>
      )}
    </DetailPanel>
  );
}

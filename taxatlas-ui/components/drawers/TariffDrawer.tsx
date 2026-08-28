import { useQuery } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { fmtDate, fmtDateTime, fmtRate } from "@/taxatlas-ui/lib/format";
import { TARIFF_MEASURE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import { DetailPanel, Kv, PanelSkeleton, Prose } from "@/taxatlas-ui/components/detail/DetailPanel";
import { StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef, SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { ChangeHistory } from "@/taxatlas-ui/components/detail/ChangeHistory";
import { WatchButton } from "@/taxatlas-ui/components/detail/WatchButton";
import type { RecordDrawerProps } from "./RegulationDrawer";
import { BilingualProse, BilingualTitle, LangTag } from "@/taxatlas-ui/components/ui/Bilingual";
import { langName } from "@/taxatlas-ui/lib/i18n";

export function TariffDrawer({ id, onClose, mode = "push", onPrev, onNext }: RecordDrawerProps) {
  const q = useQuery({ queryKey: ["tariff", id], queryFn: () => api.tariffs.get(id!), enabled: id != null });
  const t = q.data;
  return (
    <DetailPanel
      mode={mode}
      open={id != null}
      onClose={onClose}
      label="Tariff measure detail"
      idLine={
        <>
          <span className="code">TAR-{String(id ?? 0).padStart(4, "0")}</span>
          {t && <span>{label(TARIFF_MEASURE_LABEL, t.measure_type)}</span>}
          {t && <StatusMarker value={t.status} />}
          {t && <LangTag lang={t.lang} />}
        </>
      }
      title={t ? <BilingualTitle original={t.product_description} lang={t.lang} translation={t.product_description_en} /> : q.isLoading ? "Loading…" : "Tariff measure"}
      onPrev={onPrev}
      onNext={onNext}
      foot={
        t && (
          <>
            {t.source_url && (
              <a className="btn" href={t.source_url} target="_blank" rel="noreferrer">
                Open source ↗
              </a>
            )}
            <WatchButton code={t.importing_jurisdiction?.code} long />
          </>
        )
      }
    >
      {q.isLoading && <PanelSkeleton />}
      {q.isError && <Prose>Could not load this measure ({(q.error as { status?: number }).status ?? "network"}). <button type="button" className="ta-link-btn" onClick={() => q.refetch()}>Retry</button></Prose>}
      {t && (
        <>
          <div className="ta-sect" style={{ paddingBottom: 0, borderBottom: 0 }}>
            <h3>Overview</h3>
          </div>
          <Kv
            rows={[
              ["Importer", <JRef j={t.importing_jurisdiction} />],
              ["Partner", t.partner_jurisdiction ? <JRef j={t.partner_jurisdiction} /> : <span>— ({t.partner_scope ?? "all"})</span>],
              ["HS code", t.hs_code, { mono: true }],
              ["Measure", label(TARIFF_MEASURE_LABEL, t.measure_type)],
              ["Rate", t.rate != null ? fmtRate(t.rate) : t.rate_text ?? null, { mono: true }],
              ["Legal basis", t.legal_basis ? <span lang={t.lang || undefined} dir="auto">{t.legal_basis}</span> : null],
              ...(t.lang ? ([["Language", <><span>{langName(t.lang)}</span> <span className="ta-faint mono">{t.lang}</span></>]] as Array<[string, React.ReactNode]>) : []),
              ["Effective", <>{fmtDate(t.effective_from)} → {t.effective_to ? fmtDate(t.effective_to) : "open"}</>, { mono: true }],
              ["Updated", fmtDateTime(t.updated_at), { mono: true }],
              ["Source", <SourceLink href={t.source_url} full />],
            ]}
          />
          {t.rate_text && t.rate != null && (
            <Prose title="Rate text">
              <p className="mono">{t.rate_text}</p>
            </Prose>
          )}
          {t.notes && (
            <Prose title="Notes">
              <BilingualProse original={t.notes} lang={t.lang} translation={t.notes_en} />
            </Prose>
          )}
          <ChangeHistory entityType="tariff" entityId={t.id} />
        </>
      )}
    </DetailPanel>
  );
}

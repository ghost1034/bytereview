/* Jurisdiction detail — the title plate of the atlas (pages/jurisdiction-detail.md).
   Serif h1 (the only serif on the page), IDs line, summary, action row, locator mini-map, stat strip (sticky),
   left: tabs (Rates · Regulations · Court decisions · Tariffs · Changes · Sub-jurisdictions), right: sidebar lists.
   Admin affordances (Edit profile, Record new rate, Add/Edit/Delete) post to /api/taxatlas/v1/admin/*. */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "@/taxatlas-ui/lib/navigation";
import { api } from "@/taxatlas-ui/lib/api";
import { useAuth } from "@/taxatlas-ui/lib/auth";
import { fmtDate, fmtInt, fmtRate } from "@/taxatlas-ui/lib/format";
import { LEVEL_LABEL, TARIFF_MEASURE_LABEL, TAX_TYPE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import { groupRates } from "@/taxatlas-ui/lib/rates";
import { copyText } from "@/taxatlas-ui/lib/utils";
import type { CourtDecisionCreate, CourtDecisionOut, JurisdictionDetail, JurisdictionOut, JurisdictionSummary, RateCreate, RegulationCreate, RegulationOut, SourceOut, TariffCreate, TariffOut, TaxRateOut } from "@/taxatlas-ui/lib/types";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { useToast } from "@/taxatlas-ui/components/ui/Toast";
import { PushLayout } from "@/taxatlas-ui/components/detail/DetailPanel";
import { StatStrip } from "@/taxatlas-ui/components/detail/StatStrip";
import { Sparkline } from "@/taxatlas-ui/components/detail/Sparkline";
import { MiniMap } from "@/taxatlas-ui/components/detail/MiniMap";
import { SideSection } from "@/taxatlas-ui/components/detail/SidebarLists";
import { ConfidenceMarker, CountPill, SignificanceMark, StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef, SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { WatchButton } from "@/taxatlas-ui/components/detail/WatchButton";
import { downloadAuthenticated } from "@/taxatlas-ui/components/detail/download";
import { ErrorRow, MessageRow, SkeletonRows, Th } from "@/taxatlas-ui/components/detail/DataTable";
import { RatesByType, isExpired } from "@/taxatlas-ui/components/RatesTable";
import { ChangeRow } from "@/taxatlas-ui/components/ChangeRow";
import { RegulationDrawer } from "@/taxatlas-ui/components/drawers/RegulationDrawer";
import { CourtDecisionDrawer } from "@/taxatlas-ui/components/drawers/CourtDecisionDrawer";
import { TariffDrawer } from "@/taxatlas-ui/components/drawers/TariffDrawer";
import { EntityFormDrawer, type FormValues } from "@/taxatlas-ui/components/admin/EntityFormDrawer";
import { DECISION_FIELDS, JURISDICTION_PROFILE_FIELDS, RATE_CORRECT_FIELDS, RATE_RECORD_FIELDS, REGULATION_FIELDS, TARIFF_FIELDS } from "@/taxatlas-ui/components/admin/specs";
import { Bilingual, BilingualCell, EnLine } from "@/taxatlas-ui/components/ui/Bilingual";
import "@/taxatlas-ui/components/detail/lists.css";

type Tab = "rates" | "regulations" | "courts" | "tariffs" | "changes" | "children";
const TABS: Tab[] = ["rates", "regulations", "courts", "tariffs", "changes", "children"];
type Open = { kind: "regulation" | "court_decision" | "tariff"; id: number } | null;

/** Route element: remounts the page per jurisdiction so drawers, editors and tab-local toggles opened on one
 *  jurisdiction do not survive a client-side navigation to another (breadcrumb, "Part of", palette). */
export default function JurisdictionRoute() {
  const { code = "" } = useParams();
  return <JurisdictionPage key={code} code={code} />;
}

function JurisdictionPage({ code }: { code: string }) {
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get("tab");
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "rates";
  const setTab = (t: Tab) => setSp((p) => { const n = new URLSearchParams(p); if (t === "rates") n.delete("tab"); else n.set("tab", t); return n; }, { replace: true });
  const nav = useNavigate();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [editProfile, setEditProfile] = useState(false);
  const [open, setOpen] = useState<Open>(null);
  const admin = useAdminOps(code);

  const detail = useQuery({ queryKey: ["jurisdiction", code], queryFn: () => api.jurisdictions.get(code) });
  const summary = useQuery({ queryKey: ["summary", code], queryFn: () => api.jurisdictions.summary(code) });
  const parent = useQuery({ queryKey: ["jurisdiction", detail.data?.parent_code], queryFn: () => api.jurisdictions.get(detail.data!.parent_code!), enabled: !!detail.data?.parent_code });
  const sources = useQuery({ queryKey: ["sources", { jurisdiction: code }], queryFn: () => api.sources.list({ jurisdiction: code }), enabled: !!detail.data });
  const hist = useQuery({ queryKey: ["changes-histogram", { days: 30, jurisdiction: code }], queryFn: () => api.changes.histogram({ days: 30, jurisdiction: code }), retry: false, staleTime: 60_000, enabled: !!detail.data });
  const j = detail.data;
  usePageTitle(j ? `${j.name} (${j.code})` : code.toUpperCase());

  const close = useCallback(() => setOpen(null), []);
  const openRec = useCallback((kind: NonNullable<Open>["kind"], id: number) => setOpen({ kind, id }), []);
  const panel = open?.kind === "regulation" ? <RegulationDrawer id={open.id} onClose={close} /> : open?.kind === "court_decision" ? <CourtDecisionDrawer id={open.id} onClose={close} /> : open?.kind === "tariff" ? <TariffDrawer id={open.id} onClose={close} /> : null;

  if (detail.isError) {
    const status = (detail.error as { status?: number }).status;
    return (
      <PushLayout>
        <div style={{ padding: "48px 0", maxWidth: 560 }}>
          <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: "var(--text-3xl)", margin: 0, letterSpacing: "var(--tracking-tight)" }}>
            {status === 404 ? <>Jurisdiction <span className="mono">{code.toUpperCase()}</span> is not tracked</> : "Could not load this jurisdiction"}
          </h1>
          <p className="ta-muted" style={{ marginTop: 10 }}>{status === 404 ? "It may be inactive or the code may be misspelt." : `HTTP ${status ?? "network"}`}</p>
          <p style={{ marginTop: 14 }}>
            <Link to="/jurisdictions" className="btn">Search jurisdictions →</Link>{" "}
            {status !== 404 && <button type="button" className="btn btn-ghost" onClick={() => detail.refetch()}>Retry</button>}
          </p>
        </div>
      </PushLayout>
    );
  }

  const isState = !!j && !!j.parent_code;
  const mapLayer: "world" | "us" = isState ? "us" : "world";
  const selKey = j ? (isState ? j.fips : j.iso_numeric) : null;
  const vat = summary.data?.rates_by_type?.vat?.find((r) => r.rate_kind === "standard") ?? summary.data?.rates_by_type?.gst?.find((r) => r.rate_kind === "standard") ?? summary.data?.rates_by_type?.sales_use?.find((r) => r.rate_kind === "standard");
  const showOnMap = !!j && (j.level === "country" || j.level === "state" || j.level === "province");
  // `rates_count` spans every descendant (US = 254) while the Rates tab lists this jurisdiction's own current rows
  // (US = 9): the tab pill counts the latter; the stat strip keeps the tree total and says so.
  const ownRates = summary.data ? Object.values(summary.data.rates_by_type).reduce((n, rows) => n + rows.length, 0) : undefined;

  return (
    <PushLayout panel={panel}>
      <nav className="ta-crumbs" aria-label="Breadcrumb">
        <Link to="/jurisdictions">Jurisdictions</Link>
        {j?.parent_code ? (
          <>
            <span className="sep">/</span>
            <Link to={`/jurisdictions/${encodeURIComponent(j.parent_code)}`}>{parent.data?.name ?? j.parent_code}</Link>
          </>
        ) : j?.region ? (
          <>
            <span className="sep">/</span>
            <Link to={`/jurisdictions?region=${encodeURIComponent(j.region)}`}>{j.region}</Link>
          </>
        ) : null}
        <span className="sep">/</span>
        <span>{j?.name ?? code.toUpperCase()}</span>
      </nav>

      {!j ? (
        <section className="ta-plate" aria-busy="true">
          <div>
            <span className="ta-sk" style={{ width: 260, height: 30, display: "block" }} />
            <span className="ta-sk" style={{ width: 380, display: "block", marginTop: 14 }} />
            <span className="ta-sk" style={{ width: 520, display: "block", marginTop: 14 }} />
          </div>
          <div className="ta-minimap" />
        </section>
      ) : (
        <>
          <section className="ta-plate">
            <div>
              <h1>{j.name}</h1>
              <div className="ids">
                <span className="mono">
                  {j.code}
                  {j.iso_alpha3 && <> · {j.iso_alpha3}</>}
                  {j.iso_numeric && <> · {j.iso_numeric}</>}
                  {isState && j.fips && <> · FIPS {j.fips}</>}
                </span>
                <span>
                  {label(LEVEL_LABEL, j.level)}
                  {j.region && <> · {j.region}</>}
                  {j.currency && <> · <span className="mono">{j.currency}</span></>}
                </span>
                {isState && j.parent_code && (
                  <span>
                    Part of <Link to={`/jurisdictions/${encodeURIComponent(j.parent_code)}`} className="mono">{j.parent_code}</Link> {parent.data?.name}
                  </span>
                )}
                {!isState && <span>Sub-national taxes: <span className="mono">{j.has_subnational_taxes ? "yes" : "no"}</span></span>}
                {j.tax_authority_name && (
                  <span className="bi" title={[j.tax_authority_name, j.tax_authority_name_en].filter(Boolean).join("\n")}>
                    {j.tax_authority_url ? <SourceLink href={j.tax_authority_url}><span dir="auto">{j.tax_authority_name}</span></SourceLink> : <span dir="auto">{j.tax_authority_name}</span>}
                    <EnLine text={j.tax_authority_name_en} />
                  </span>
                )}
              </div>
              {j.summary && <p className="summary">{j.summary}</p>}
              <div className="actions">
                <WatchButton code={j.code} primary />
                {showOnMap && (
                  <button type="button" className="btn" onClick={() => nav(`/map?sel=${encodeURIComponent(j.code)}`)}>
                    Show on map
                  </button>
                )}
                <button type="button" className="btn" onClick={() => downloadAuthenticated(`/export/snapshot?jurisdiction=${encodeURIComponent(j.code)}`, `taxatlas-${j.code}.json`).catch((e) => toast.error(e))} title="JSON snapshot of this jurisdiction and its descendants">
                  Export snapshot
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { void copyText(`GET /api/taxatlas/v1/jurisdictions/${j.code}`); toast.info("Copied", `GET /api/taxatlas/v1/jurisdictions/${j.code}`); }} title="Copy the API path for this jurisdiction">
                  Copy API path <span className="kbd" style={{ marginLeft: 4 }}>/jurisdictions/{j.code}</span>
                </button>
                {isAdmin && (
                  <button type="button" className="btn btn-ghost" onClick={() => setEditProfile(true)}>
                    Edit profile
                  </button>
                )}
              </div>
            </div>
            <MiniMap
              layer={mapLayer}
              selectedKey={selKey}
              cropBounds={j.code === "US" ? [[-125, 24], [-66, 50]] : undefined}
              caption={
                <>
                  {j.lat != null && j.lon != null && (
                    <span className="mono">
                      {Math.abs(j.lat).toFixed(1)}°{j.lat >= 0 ? "N" : "S"} {Math.abs(j.lon).toFixed(1)}°{j.lon >= 0 ? "E" : "W"}
                    </span>
                  )}
                  {vat && vat.rate != null && (
                    <span>
                      {label(TAX_TYPE_LABEL, vat.tax_type)} standard <span className="mono">{fmtRate(vat.rate)}</span>
                    </span>
                  )}
                  {!selKey && <span>No geometry for this level</span>}
                </>
              }
            />
          </section>

          <div className="ta-sticky-strip">
            <StatStrip
              label="Coverage"
              cells={[
                { label: "Rates", value: j.rates_count, qualifier: j.children_count > 0 ? "current · incl. sub-jurisdictions" : "current" },
                { label: "Regulations", value: j.regulations_count },
                { label: "Court decisions", value: j.court_decisions_count },
                { label: "Tariff measures", value: j.tariffs_count, qualifier: "as importer" },
                { label: "Sources", value: sources.data ? sources.data.length : "…", qualifier: sources.data ? `${sources.data.filter((s) => s.enabled).length} enabled` : undefined },
                { label: "Changes · 30 d", value: j.changes_30d, spark: hist.data ? <Sparkline values={hist.data.days.map((d) => d.count)} /> : undefined },
              ]}
            />
          </div>

          <div className="ta-body">
            <div style={{ minWidth: 0 }}>
              <div className="tabs" role="tablist" aria-label="Sections" style={{ marginBottom: 12 }}>
                {(
                  [
                    ["rates", "Rates", ownRates ?? j.rates_count],
                    ["regulations", "Regulations", j.regulations_count],
                    ["courts", "Court decisions", j.court_decisions_count],
                    ["tariffs", "Tariffs", j.tariffs_count],
                    ["changes", "Changes", j.changes_30d],
                    ...(j.children_count > 0 ? [["children", "Sub-jurisdictions", j.children_count] as const] : []),
                  ] as Array<readonly [Tab, string, number]>
                ).map(([k, l, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                    {l}
                    <CountPill n={n} />
                  </button>
                ))}
              </div>
              {tab === "rates" && <RatesTab code={j.code} isAdmin={isAdmin} admin={admin} />}
              {tab === "regulations" && <RegulationsTab code={j.code} isAdmin={isAdmin} admin={admin} onOpen={(id) => openRec("regulation", id)} />}
              {tab === "courts" && <CourtsTab code={j.code} isAdmin={isAdmin} admin={admin} onOpen={(id) => openRec("court_decision", id)} />}
              {tab === "tariffs" && <TariffsTab code={j.code} isAdmin={isAdmin} admin={admin} onOpen={(id) => openRec("tariff", id)} />}
              {tab === "changes" && <ChangesTab code={j.code} onOpen={(kind, id) => openRec(kind, id)} />}
              {tab === "children" && <ChildrenTab code={j.code} />}
            </div>
            <Sidebar j={j} summaryQ={summary} sources={sources.data} onOpen={openRec} />
          </div>

          {isAdmin && (
            <EntityFormDrawer
              open={editProfile}
              onClose={() => setEditProfile(false)}
              mode="edit"
              title={`Edit profile · ${j.code}`}
              subtitle="PATCH /admin/jurisdictions"
              objectName={j.name}
              fields={JURISDICTION_PROFILE_FIELDS}
              initial={j as unknown as FormValues}
              onSubmit={(body) => admin.run(() => api.admin.patchJurisdiction(j.code, body), `Profile updated for ${j.name}`)}
            />
          )}
        </>
      )}
    </PushLayout>
  );
}

/* ---------------------------------------------------------------- sidebar */
function Sidebar({ j, summaryQ, sources, onOpen }: { j: JurisdictionDetail; summaryQ: UseQueryResult<JurisdictionSummary>; sources?: SourceOut[]; onOpen: (kind: NonNullable<Open>["kind"], id: number) => void }) {
  const s = summaryQ.data;
  const isState = !!j.parent_code;
  return (
    <aside className="ta-side" aria-label="Related records">
      <SideSection
        title="Regulations"
        count={j.regulations_count}
        allHref={`/regulations?jurisdiction=${encodeURIComponent(j.code)}`}
        items={s?.recent_regulations.slice(0, 3).map((r) => ({
          key: r.id,
          title: <Bilingual original={r.title} lang={r.lang} translation={r.title_en} />,
          onOpen: () => onOpen("regulation", r.id),
          meta: (
            <>
              <span className="mono">{fmtDate(r.published_date)}</span>
              <span>{label({}, r.doc_type)}</span>
              <StatusMarker value={r.status} />
            </>
          ),
        }))}
        empty="No regulations recorded."
      />
      {(!isState || j.court_decisions_count > 0) && (
        <SideSection
          title="Court decisions"
          count={j.court_decisions_count}
          allHref={`/court-decisions?jurisdiction=${encodeURIComponent(j.code)}`}
          items={s?.recent_court_decisions.slice(0, 3).map((d) => ({
            key: d.id,
            title: <Bilingual original={d.case_name} lang={d.lang} translation={d.case_name_en} />,
            onOpen: () => onOpen("court_decision", d.id),
            meta: (
              <>
                <span className="mono">{fmtDate(d.decision_date)}</span>
                <span>{d.court}</span>
                {(d.docket || d.citation) && <span className="mono">{d.docket ?? d.citation}</span>}
                <SignificanceMark level={d.significance} />
              </>
            ),
          }))}
          empty="No court decisions recorded."
        />
      )}
      {j.tariffs_count > 0 && (
        <SideSection
          title="Tariffs"
          count={j.tariffs_count}
          allHref={`/tariffs?importer=${encodeURIComponent(j.code)}`}
          items={s?.recent_tariffs.slice(0, 3).map((t) => ({
            key: t.id,
            title: <Bilingual original={t.product_description} lang={t.lang} translation={t.product_description_en} />,
            onOpen: () => onOpen("tariff", t.id),
            meta: (
              <>
                <span className="mono">{fmtDate(t.effective_from)}</span>
                <span>{label(TARIFF_MEASURE_LABEL, t.measure_type)}</span>
                {t.partner_jurisdiction && <span className="mono">{t.partner_jurisdiction.code}</span>}
                <StatusMarker value={t.status} />
              </>
            ),
          }))}
        />
      )}
      <SideSection title="Recent changes" count={j.changes_30d} allHref={`/changes?jurisdiction=${encodeURIComponent(j.code)}`} allLabel="Feed →">
        {s && s.recent_changes.length === 0 && <div className="ta-empty">No changes in the last 30 days.</div>}
        {s?.recent_changes.slice(0, 4).map((c) => (
          <ChangeRow key={c.id} c={c} compact plainJurisdiction onOpen={c.entity_type === "regulation" || c.entity_type === "court_decision" || c.entity_type === "tariff" ? () => onOpen(c.entity_type as NonNullable<Open>["kind"], c.entity_id) : undefined} />
        ))}
      </SideSection>
      <SideSection title="Sources" count={sources?.length} allHref={`/sources?jurisdiction=${encodeURIComponent(j.code)}`}>
        {sources && sources.length === 0 && <div className="ta-empty">No sources registered for this jurisdiction.</div>}
        {sources && sources.length > 0 && (
          <div className="ta-subj">
            {sources.slice(0, 6).map((src) => (
              <Link key={src.id} to={`/sources?source_id=${src.id}`} title={src.name}>
                <b>{src.slug}</b>
                {label({}, src.category)} · {src.enabled ? "enabled" : "disabled"}
              </Link>
            ))}
          </div>
        )}
      </SideSection>
    </aside>
  );
}

/* ---------------------------------------------------------------- admin plumbing */
function useAdminOps(code: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const run = async <T,>(fn: () => Promise<T>, title: string): Promise<T> => {
    const out = await fn();
    await Promise.all(
      ["jurisdiction", "jurisdictions", "jurisdiction-rates", "summary", "regulations", "court-decisions", "tariffs", "changes", "changes-histogram", "changes-count", "notifications", "stats", "choropleth"].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
    toast.success(title, "Recorded as a change event.", { label: "View in change feed", href: `/changes?jurisdiction=${encodeURIComponent(code)}` });
    return out;
  };
  return { run };
}
type AdminOps = ReturnType<typeof useAdminOps>;

function TabToolbar({ children, left }: { children?: React.ReactNode; left?: React.ReactNode }) {
  return (
    <div className="ta-rates-head">
      {left}
      <span className="spacer" />
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- rates */
type RateEditor = { kind: "correct"; rate: TaxRateOut } | { kind: "record"; from: TaxRateOut | null };

function RatesTab({ code, isAdmin, admin }: { code: string; isAdmin: boolean; admin: AdminOps }) {
  const toast = useToast();
  const [expired, setExpired] = useState(false);
  const [editor, setEditor] = useState<RateEditor | null>(null);
  const q = useQuery({ queryKey: ["jurisdiction-rates", code, expired], queryFn: () => api.jurisdictions.rates(code, { current_only: !expired }) });
  const grouped = useMemo(() => groupRates(q.data ?? []), [q.data]);
  const asOf = useMemo(() => {
    const dates = (q.data ?? []).map((r) => r.as_of).filter((d): d is string => !!d).sort();
    return dates.length ? dates[Math.floor(dates.length / 2)] : null;
  }, [q.data]);
  const today = new Date().toISOString().slice(0, 10);
  const recordInitial: FormValues = editor?.kind === "record" && editor.from ? { ...editor.from, effective_from: today, effective_to: null, as_of: today, notes: null } : { confidence: "reported", effective_from: today, as_of: today };
  const expiredCount = (q.data ?? []).filter((r) => isExpired(r)).length;
  return (
    <div>
      <TabToolbar
        left={
          <>
            <h2>Rates</h2>
            <span className="ta-faint" style={{ fontSize: "var(--text-xs)" }}>
              <span className="mono">{q.data ? `${q.data.length} rows` : "…"}</span>
              {asOf && <> · as of <span className="mono">{fmtDate(asOf)}</span> unless stated</>}
              {expired && expiredCount > 0 && <> · <span className="mono">{expiredCount}</span> expired</>}
            </span>
          </>
        }
      >
        <label className={expired ? "ta-toggle on" : "ta-toggle"}>
          <input type="checkbox" checked={expired} onChange={(e) => setExpired(e.target.checked)} aria-label="Show historical (expired) rates" />
          <i aria-hidden="true" />
          Show expired
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadAuthenticated(`/export/rates.csv?jurisdiction=${encodeURIComponent(code)}`, `rates-${code}.csv`).catch((e) => toast.error(e))} title="CSV of all rates for this jurisdiction (incl. history)">
          CSV
        </button>
        {isAdmin && (
          <button type="button" className="btn btn-sm" onClick={() => setEditor({ kind: "record", from: null })}>
            Record new rate
          </button>
        )}
      </TabToolbar>
      {q.isLoading ? (
        <table className="tbl lt" aria-hidden="true"><tbody><SkeletonRows cols={5} rows={6} /></tbody></table>
      ) : q.isError ? (
        <div className="ta-empty" style={{ padding: "24px 0" }}>Could not load rates. <button type="button" className="ta-link-btn" onClick={() => q.refetch()}>Retry</button></div>
      ) : (
        <div className="ta-rates-wrap">
          <RatesByType grouped={grouped} onEdit={isAdmin ? (rate) => setEditor({ kind: "correct", rate }) : undefined} onRecordNew={isAdmin ? (rate) => setEditor({ kind: "record", from: rate }) : undefined} />
        </div>
      )}
      <div className="ta-prov" style={{ marginTop: 10 }}>
        Rates are percentages of the taxable base; thresholds in local currency. Confidence: <ConfidenceMarker level="verified" /> against primary authority · <ConfidenceMarker level="reported" /> by a secondary source · <ConfidenceMarker level="estimated" /> editorially.
      </div>
      {isAdmin && (
        <>
          <EntityFormDrawer
            open={editor?.kind === "correct"}
            onClose={() => setEditor(null)}
            mode="edit"
            title={editor?.kind === "correct" ? `Correct rate #${editor.rate.id}` : "Correct rate"}
            subtitle="PATCH /admin/rates"
            objectName={editor?.kind === "correct" ? `rate #${editor.rate.id} (${label(TAX_TYPE_LABEL, editor.rate.tax_type)} · ${editor.rate.rate_kind})` : undefined}
            note="Fixes this row in place. Use Record new rate for a rate change over time."
            fields={RATE_CORRECT_FIELDS}
            initial={editor?.kind === "correct" ? (editor.rate as unknown as FormValues) : {}}
            onSubmit={(body) => admin.run(() => api.admin.patchRate((editor as { rate: TaxRateOut }).rate.id, body), "Rate corrected")}
            onDelete={(reason) => admin.run(() => api.admin.deleteRate((editor as { rate: TaxRateOut }).rate.id, reason), "Rate deleted")}
          />
          <EntityFormDrawer
            open={editor?.kind === "record"}
            onClose={() => setEditor(null)}
            mode="create"
            title="Record new rate"
            subtitle={`POST /admin/rates · ${code}`}
            fields={RATE_RECORD_FIELDS}
            initial={recordInitial}
            submitLabel="Record rate"
            note="The currently open row for this tax type / kind is closed the day before the new effective date and a rate_changed event is emitted."
            onSubmit={(body) => admin.run(() => api.admin.createRate({ ...(body as Omit<RateCreate, "jurisdiction_code">), jurisdiction_code: code, supersede: true }), "New rate recorded")}
          />
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- regulations */
function RegulationsTab({ code, isAdmin, admin, onOpen }: { code: string; isAdmin: boolean; admin: AdminOps; onOpen: (id: number) => void }) {
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; row: RegulationOut } | null>(null);
  const q = useQuery({ queryKey: ["regulations", { jurisdiction: code }, 100], queryFn: () => api.regulations.list({ jurisdiction: code, limit: 100 }) });
  const cols = 6 + (isAdmin ? 1 : 0);
  return (
    <>
      <TabToolbar left={<h2>Regulations</h2>}>
        <Link to={`/regulations?jurisdiction=${encodeURIComponent(code)}`} className="btn btn-ghost btn-sm">Open in list →</Link>
        {isAdmin && <button type="button" className="btn btn-sm" onClick={() => setEditor({ mode: "create" })}>Add regulation</button>}
      </TabToolbar>
      <table className="tbl lt dense" aria-label="Regulations">
        <thead>
          <tr>
            <Th width={100}>Published</Th>
            <Th>Title · authority</Th>
            <Th width={120}>Tax type</Th>
            <Th width={90}>Type</Th>
            <Th width={110}>Status</Th>
            <Th width={100} num>Effective</Th>
            {isAdmin && <Th width={70}><span className="sr-only">Actions</span></Th>}
          </tr>
        </thead>
        <tbody>
          {q.isLoading ? (
            <SkeletonRows cols={cols} rows={5} />
          ) : q.isError ? (
            <ErrorRow cols={cols} error={q.error} noun="regulations" onRetry={() => q.refetch()} />
          ) : q.data && q.data.items.length === 0 ? (
            <MessageRow cols={cols}>No regulations for this jurisdiction</MessageRow>
          ) : (
            q.data?.items.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => onOpen(r.id)}>
                <td className="date">{fmtDate(r.published_date)}</td>
                <td className="title">
                  <BilingualCell
                    title={r.title}
                    titleEn={r.title_en}
                    lang={r.lang}
                    sub={(r.authority || (r.jurisdiction && r.jurisdiction.code !== code)) ? `${r.jurisdiction && r.jurisdiction.code !== code ? `${r.jurisdiction.code} · ` : ""}${r.authority ?? ""}` : undefined}
                    subEn={r.authority_en}
                  />
                </td>
                <td className="text">{label(TAX_TYPE_LABEL, r.tax_type)}</td>
                <td className="text">{label({}, r.doc_type)}</td>
                <td><StatusMarker value={r.status} /></td>
                <td className="date num">{fmtDate(r.effective_date)}</td>
                {isAdmin && (
                  <td className="act" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Edit ${r.title}`} onClick={() => setEditor({ mode: "edit", row: r })}>Edit</button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {q.data && q.data.total > q.data.items.length && <div className="ta-prov" style={{ marginTop: 8 }}>Showing {q.data.items.length} of {fmtInt(q.data.total)} · <Link to={`/regulations?jurisdiction=${encodeURIComponent(code)}`}>Open in full list with filters →</Link></div>}
      {isAdmin && (
        <EntityFormDrawer
          open={!!editor}
          onClose={() => setEditor(null)}
          mode={editor?.mode ?? "create"}
          title={editor?.mode === "edit" ? `Edit regulation #${editor.row.id}` : "Add regulation"}
          subtitle={`/admin/regulations · ${code}`}
          objectName={editor?.mode === "edit" ? editor.row.title : undefined}
          fields={REGULATION_FIELDS}
          initial={editor?.mode === "edit" ? (editor.row as unknown as FormValues) : { status: "enacted", doc_type: "regulation" }}
          onSubmit={(body) => (editor?.mode === "edit" ? admin.run(() => api.admin.patchRegulation(editor.row.id, body), "Regulation updated") : admin.run(() => api.admin.createRegulation({ ...(body as Omit<RegulationCreate, "jurisdiction_code">), jurisdiction_code: code }), "Regulation added"))}
          onDelete={editor?.mode === "edit" ? (reason) => admin.run(() => api.admin.deleteRegulation(editor.row.id, reason), "Regulation deleted") : undefined}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- court decisions */
function CourtsTab({ code, isAdmin, admin, onOpen }: { code: string; isAdmin: boolean; admin: AdminOps; onOpen: (id: number) => void }) {
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; row: CourtDecisionOut } | null>(null);
  const q = useQuery({ queryKey: ["court-decisions", { jurisdiction: code }, 100], queryFn: () => api.courtDecisions.list({ jurisdiction: code, limit: 100 }) });
  const cols = 5 + (isAdmin ? 1 : 0);
  return (
    <>
      <TabToolbar left={<h2>Court decisions</h2>}>
        <Link to={`/court-decisions?jurisdiction=${encodeURIComponent(code)}`} className="btn btn-ghost btn-sm">Open in list →</Link>
        {isAdmin && <button type="button" className="btn btn-sm" onClick={() => setEditor({ mode: "create" })}>Add decision</button>}
      </TabToolbar>
      <table className="tbl lt dense" aria-label="Court decisions">
        <thead>
          <tr>
            <Th width={100}>Decided</Th>
            <Th>Case · court</Th>
            <Th width={130}>Tax types</Th>
            <Th width={112}>Sig</Th>
            <Th width={118}>Outcome</Th>
            {isAdmin && <Th width={70}><span className="sr-only">Actions</span></Th>}
          </tr>
        </thead>
        <tbody>
          {q.isLoading ? (
            <SkeletonRows cols={cols} rows={5} />
          ) : q.isError ? (
            <ErrorRow cols={cols} error={q.error} noun="court decisions" onRetry={() => q.refetch()} />
          ) : q.data && q.data.items.length === 0 ? (
            <MessageRow cols={cols}>No court decisions for this jurisdiction</MessageRow>
          ) : (
            q.data?.items.map((d) => (
              <tr key={d.id} className="row-link" onClick={() => onOpen(d.id)}>
                <td className="date">{fmtDate(d.decision_date)}</td>
                <td className="title">
                  <BilingualCell title={d.case_name} titleEn={d.case_name_en} lang={d.lang} sub={`${d.court}${d.citation ? ` · ${d.citation}` : ""}`} />
                </td>
                <td className="text">{(d.tax_types ?? []).slice(0, 3).map((t) => label(TAX_TYPE_LABEL, t)).join(" · ") || "—"}</td>
                <td><SignificanceMark level={d.significance} /></td>
                <td><StatusMarker value={d.outcome} /></td>
                {isAdmin && (
                  <td className="act" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Edit ${d.case_name}`} onClick={() => setEditor({ mode: "edit", row: d })}>Edit</button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {isAdmin && (
        <EntityFormDrawer
          open={!!editor}
          onClose={() => setEditor(null)}
          mode={editor?.mode ?? "create"}
          title={editor?.mode === "edit" ? `Edit decision #${editor.row.id}` : "Add court decision"}
          subtitle={`/admin/court-decisions · ${code}`}
          objectName={editor?.mode === "edit" ? editor.row.case_name : undefined}
          fields={DECISION_FIELDS}
          initial={editor?.mode === "edit" ? (editor.row as unknown as FormValues) : { significance: "routine", outcome: "pending" }}
          onSubmit={(body) => (editor?.mode === "edit" ? admin.run(() => api.admin.patchDecision(editor.row.id, body), "Decision updated") : admin.run(() => api.admin.createDecision({ ...(body as Omit<CourtDecisionCreate, "jurisdiction_code">), jurisdiction_code: code }), "Decision added"))}
          onDelete={editor?.mode === "edit" ? (reason) => admin.run(() => api.admin.deleteDecision(editor.row.id, reason), "Decision deleted") : undefined}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- tariffs */
function TariffsTab({ code, isAdmin, admin, onOpen }: { code: string; isAdmin: boolean; admin: AdminOps; onOpen: (id: number) => void }) {
  const [editor, setEditor] = useState<{ mode: "create" } | { mode: "edit"; row: TariffOut } | null>(null);
  const q = useQuery({ queryKey: ["tariffs", { importer: code }, 100], queryFn: () => api.tariffs.list({ importer: code, limit: 100 }) });
  const cols = 7 + (isAdmin ? 1 : 0);
  return (
    <>
      <TabToolbar left={<h2>Tariff measures</h2>}>
        <Link to={`/tariffs?importer=${encodeURIComponent(code)}`} className="btn btn-ghost btn-sm">Open in list →</Link>
        {isAdmin && <button type="button" className="btn btn-sm" onClick={() => setEditor({ mode: "create" })}>Add tariff</button>}
      </TabToolbar>
      <table className="tbl lt dense" aria-label="Tariff measures">
        <thead>
          <tr>
            <Th width={100}>Effective</Th>
            <Th width={150}>Partner</Th>
            <Th width={110}>Measure</Th>
            <Th width={70}>HS</Th>
            <Th>Product / description</Th>
            <Th width={80} num>Rate</Th>
            <Th width={110}>Status</Th>
            {isAdmin && <Th width={70}><span className="sr-only">Actions</span></Th>}
          </tr>
        </thead>
        <tbody>
          {q.isLoading ? (
            <SkeletonRows cols={cols} rows={5} />
          ) : q.isError ? (
            <ErrorRow cols={cols} error={q.error} noun="tariff measures" onRetry={() => q.refetch()} />
          ) : q.data && q.data.items.length === 0 ? (
            <MessageRow cols={cols}>No tariff measures where this jurisdiction is the importer</MessageRow>
          ) : (
            q.data?.items.map((t) => (
              <tr key={t.id} className="row-link" onClick={() => onOpen(t.id)}>
                <td className="date">{fmtDate(t.effective_from)}</td>
                <td>{t.partner_jurisdiction ? <JRef j={t.partner_jurisdiction} /> : <span className="ta-faint">— ({t.partner_scope ?? "all"})</span>}</td>
                <td className="text">{label(TARIFF_MEASURE_LABEL, t.measure_type)}</td>
                <td className="code">{t.hs_code ?? "—"}</td>
                <td className="title"><BilingualCell title={t.product_description} titleEn={t.product_description_en} lang={t.lang} sub={t.legal_basis ?? undefined} /></td>
                <td className="rate num">{t.rate != null ? <>{fmtRate(t.rate).replace("%", "")}<small>%</small></> : <span className="ta-muted" style={{ fontSize: "var(--text-xs)" }}>{t.rate_text ?? "—"}</span>}</td>
                <td><StatusMarker value={t.status} /></td>
                {isAdmin && (
                  <td className="act" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Edit ${t.product_description}`} onClick={() => setEditor({ mode: "edit", row: t })}>Edit</button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {isAdmin && (
        <EntityFormDrawer
          open={!!editor}
          onClose={() => setEditor(null)}
          mode={editor?.mode ?? "create"}
          title={editor?.mode === "edit" ? `Edit tariff #${editor.row.id}` : "Add tariff measure"}
          subtitle={`/admin/tariffs · importer ${code}`}
          objectName={editor?.mode === "edit" ? editor.row.product_description : undefined}
          fields={TARIFF_FIELDS}
          initial={editor?.mode === "edit" ? ({ ...editor.row, partner_jurisdiction_code: editor.row.partner_jurisdiction?.code ?? null } as unknown as FormValues) : { status: "in_force", measure_type: "mfn" }}
          onSubmit={(body) => (editor?.mode === "edit" ? admin.run(() => api.admin.patchTariff(editor.row.id, body), "Tariff updated") : admin.run(() => api.admin.createTariff({ ...(body as Omit<TariffCreate, "importing_jurisdiction_code">), importing_jurisdiction_code: code }), "Tariff added"))}
          onDelete={editor?.mode === "edit" ? (reason) => admin.run(() => api.admin.deleteTariff(editor.row.id, reason), "Tariff deleted") : undefined}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- changes */
function ChangesTab({ code, onOpen }: { code: string; onOpen: (kind: NonNullable<Open>["kind"], id: number) => void }) {
  const q = useQuery({ queryKey: ["changes", { jurisdiction: code }, 100], queryFn: () => api.changes.list({ jurisdiction: code, limit: 100 }) });
  return (
    <>
      <TabToolbar left={<h2>Changes</h2>}>
        <Link to={`/changes?jurisdiction=${encodeURIComponent(code)}`} className="btn btn-ghost btn-sm">Open feed →</Link>
      </TabToolbar>
      <div className="ta-region">
        {q.isLoading && <div style={{ padding: 12 }}><span className="ta-sk" style={{ width: "60%", display: "block" }} /></div>}
        {q.isError && <div className="ta-empty" style={{ padding: 24 }}>Could not load changes. <button type="button" className="ta-link-btn" onClick={() => q.refetch()}>Retry</button></div>}
        {q.data && q.data.items.length === 0 && <div className="ta-empty" style={{ padding: 24, textAlign: "center" }}>No changes detected for this jurisdiction</div>}
        {q.data?.items.map((c) => (
          <ChangeRow key={c.id} c={c} onOpen={c.entity_type === "regulation" || c.entity_type === "court_decision" || c.entity_type === "tariff" ? () => onOpen(c.entity_type as NonNullable<Open>["kind"], c.entity_id) : undefined} />
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- sub-jurisdictions */
function ChildrenTab({ code }: { code: string }) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["jurisdictions", { parent: code }, "headline"], queryFn: () => api.jurisdictions.list({ parent: code, include: "headline", limit: 200 }), staleTime: 600_000 });
  type Row = JurisdictionOut & { headline?: { sales_use_standard: number | null; vat_standard: number | null; cit_headline: number | null; pit_top: number | null } | null };
  const rows = (q.data?.items ?? []) as Row[];
  const isUS = code.toUpperCase() === "US";
  const cell = (v: number | null | undefined) => (v == null ? <span className="ta-faint">—</span> : <>{v.toFixed(Number.isInteger(v) ? 1 : Math.min(3, (String(v).split(".")[1] ?? "").length))}<small>%</small></>);
  const thresholdRow = (r: Row) => r.headline?.sales_use_standard;
  return (
    <>
      <TabToolbar left={<h2>Sub-jurisdictions</h2>}>
        <Link to={`/jurisdictions?parent=${encodeURIComponent(code)}`} className="btn btn-ghost btn-sm">Open in gazetteer →</Link>
      </TabToolbar>
      <table className="tbl lt dense" aria-label="Sub-jurisdictions">
        <thead>
          <tr>
            <Th width={90}>Code</Th>
            <Th>Name</Th>
            <Th width={100}>Level</Th>
            <Th width={110} num>{isUS ? "Sales & use" : "VAT std"}</Th>
            <Th width={110} num>CIT headline</Th>
            <Th width={90} num>PIT top</Th>
          </tr>
        </thead>
        <tbody>
          {q.isLoading ? (
            <SkeletonRows cols={6} rows={6} />
          ) : q.isError ? (
            <ErrorRow cols={6} error={q.error} noun="sub-jurisdictions" onRetry={() => q.refetch()} />
          ) : rows.length === 0 ? (
            <MessageRow cols={6}>No sub-jurisdictions</MessageRow>
          ) : (
            rows.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => nav(`/jurisdictions/${encodeURIComponent(c.code)}`)}>
                <td className="code">{c.code}</td>
                <td><Link to={`/jurisdictions/${encodeURIComponent(c.code)}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", textDecoration: "none" }}>{c.name}</Link></td>
                <td className="text">{label(LEVEL_LABEL, c.level)}</td>
                <td className="rate num">{cell(isUS ? thresholdRow(c) : c.headline?.vat_standard)}</td>
                <td className="rate num">{cell(c.headline?.cit_headline)}</td>
                <td className="rate num">{cell(c.headline?.pit_top)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

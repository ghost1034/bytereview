import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/taxatlas-ui/lib/api";
import { fmtDate, fmtInt } from "@/taxatlas-ui/lib/format";
import { OUTCOMES, SIGNIFICANCE, TAX_TYPES, TAX_TYPE_LABEL, label, titleCaseOptions } from "@/taxatlas-ui/lib/enums";
import { useSearchFilters, type SortDir } from "@/taxatlas-ui/hooks/useSearchFilters";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { PushLayout } from "@/taxatlas-ui/components/detail/DetailPanel";
import { ChipDate, ChipInput, ChipSelect, FilterRow, ResultSentence, SearchChip } from "@/taxatlas-ui/components/detail/FilterChips";
import { ErrorRow, MessageRow, SkeletonRows, TableFoot, TableRegion, Th, Toolbar, useClampOffset, useListKeys, useTableSettings, type ColumnDef } from "@/taxatlas-ui/components/detail/DataTable";
import { SignificanceMark, StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef, SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { WatchButton } from "@/taxatlas-ui/components/detail/WatchButton";
import { downloadAuthenticated } from "@/taxatlas-ui/components/detail/download";
import { useToast } from "@/taxatlas-ui/components/ui/Toast";
import { CourtDecisionDrawer } from "@/taxatlas-ui/components/drawers/CourtDecisionDrawer";
import { BilingualCell, LangTag } from "@/taxatlas-ui/components/ui/Bilingual";

const DEFAULT_SORT = "decided";
const SORT_LABEL: Record<string, string> = { decided: "decided", case: "case", court: "court", jurisdiction: "jurisdiction", significance: "significance", outcome: "outcome", seen: "first seen" };
const KEYS = ["jurisdiction", "tax_type", "court", "significance", "outcome", "q", "decided_since"] as const;
const COLUMNS: ColumnDef[] = [
  { key: "decided", label: "Decided", fixed: true },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "case", label: "Case · court", fixed: true },
  { key: "lang", label: "Lang" },
  { key: "tax_types", label: "Tax types" },
  { key: "sig", label: "Significance" },
  { key: "outcome", label: "Outcome" },
  { key: "cite", label: "Citation / docket" },
  { key: "source", label: "Source" },
  { key: "tags", label: "Tags", hidden: true },
];
const ABBR: Record<string, string> = { vat: "VAT", gst: "GST", sales_use: "Sales", corporate_income: "CIT", personal_income: "PIT", withholding: "WHT", capital_gains: "CGT", digital_services: "DST", customs_tariff: "Customs", excise: "Excise", payroll_social: "Payroll", property: "Property", transfer_pricing: "TP", pillar_two: "P2", other: "Other" };

export default function CourtDecisionsPage() {
  usePageTitle("Court decisions");
  const { filters, limit, offset, open, sort, dir, set, reset, active } = useSearchFilters(KEYS);
  const toast = useToast();
  const settings = useTableSettings("court-decisions", COLUMNS);
  const show = settings.show;

  // Server-side sort: `sort`/`dir` URL params are passed straight to the API; the default order is shown when unset.
  const sortKey = sort || DEFAULT_SORT;
  const sortDir: SortDir = sort ? dir : "desc";
  const onSort = (key: string, first: SortDir) => {
    if (sortKey !== key) set({ sort: key, dir: first });
    else if (sortDir === first) set({ sort: key, dir: first === "desc" ? "asc" : "desc" });
    else set({ sort: null, dir: null });
  };
  const th = (key: string, text: string, opts?: { num?: boolean; width?: number; hidden?: boolean; first?: SortDir }) => (
    <Th key={key} num={opts?.num} width={opts?.width} hidden={opts?.hidden} sort={sortKey === key ? sortDir : null} onSort={() => onSort(key, opts?.first ?? "desc")}>
      {text}
    </Th>
  );
  const sortLabel = <b>{SORT_LABEL[sortKey] ?? sortKey} {sortDir === "asc" ? "↑" : "↓"}</b>;

  const query = useQuery({
    queryKey: ["court-decisions", filters, sort, dir, limit, offset],
    queryFn: () => api.courtDecisions.list({ ...filters, sort, dir, limit, offset }),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats.overview, staleTime: 300_000 });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const ids = useMemo(() => items.map((r) => r.id), [items]);
  const idx = open == null ? -1 : ids.indexOf(open);
  const landmark = filters.significance === "landmark";

  const openRow = useCallback((id: number) => set({ open: id }), [set]);
  const close = useCallback(() => set({ open: null }), [set]);
  const goOffset = useCallback((o: number) => set({ offset: o }), [set]);
  useClampOffset(query.data?.total, offset, limit, goOffset);
  const prevPage = useCallback(() => offset > 0 && set({ offset: Math.max(0, offset - limit) }), [offset, limit, set]);
  const nextPage = useCallback(() => query.data && offset + limit < query.data.total && set({ offset: offset + limit }), [offset, limit, set, query.data]);
  useListKeys({ ids, selected: open, onSelect: openRow, onClose: close, onPrevPage: prevPage, onNextPage: nextPage });
  const cols = settings.visible.length;

  const exportCsv = () => downloadAuthenticated(`/export/court-decisions.csv${qs({ ...filters, sort, dir })}`, "court-decisions.csv").catch((e) => toast.error(e));

  return (
    <PushLayout panel={<CourtDecisionDrawer id={open} onClose={close} onPrev={idx > 0 ? () => openRow(ids[idx - 1]) : undefined} onNext={idx >= 0 && idx < ids.length - 1 ? () => openRow(ids[idx + 1]) : undefined} />}>
      <div className="ta-head">
        <div>
          <h1>Court decisions</h1>
          <div className="sub">
            Tax litigation outcomes with holdings, significance and outcome classification
            {stats.data && <>{" · "}<span className="num">{fmtInt(stats.data.court_decisions)}</span> tracked</>}
          </div>
        </div>
        <div className="ta-actions">
          <button type="button" className="btn" onClick={exportCsv} disabled={items.length === 0} title="Server CSV of every matching row (current filters and sort; up to 5,000 rows)">Export CSV</button>
          {filters.jurisdiction ? <WatchButton code={filters.jurisdiction} taxType={filters.tax_type || null} long /> : <button type="button" className="btn btn-ghost" disabled title="Add a Jurisdiction filter to watch this view">Watch this view</button>}
        </div>
      </div>

      <FilterRow>
        <SearchChip value={filters.q} onCommit={(v) => set({ q: v })} placeholder="Case, summary, holding · searches original and English" width={320} />
        <ChipInput label="Jurisdiction" value={filters.jurisdiction} onChange={(v) => set({ jurisdiction: v })} placeholder="e.g. US" code />
        <ChipInput label="Court" value={filters.court} onChange={(v) => set({ court: v })} placeholder="Contains…" />
        <ChipSelect label="Tax type" value={filters.tax_type} onChange={(v) => set({ tax_type: v })} options={TAX_TYPES.map((t) => ({ value: t, label: TAX_TYPE_LABEL[t] }))} />
        <ChipSelect label="Significance" value={filters.significance} onChange={(v) => set({ significance: v })} options={titleCaseOptions(SIGNIFICANCE)} />
        <ChipSelect label="Outcome" value={filters.outcome} onChange={(v) => set({ outcome: v })} options={titleCaseOptions(OUTCOMES)} />
        <ChipDate label="Decided since" shortLabel="Decided" value={filters.decided_since} onChange={(v) => set({ decided_since: v })} />
        <ResultSentence shown={query.data?.total} total={stats.data?.court_decisions} active={active} onReset={reset} />
      </FilterRow>

      <TableRegion>
        <Toolbar
          sortLabel={sortLabel}
          settings={settings}
          right={
            <button type="button" className="btn btn-ghost btn-sm" aria-pressed={landmark} onClick={() => set({ significance: landmark ? "" : "landmark" })} title="Show landmark decisions only">
              <span className="mono" style={{ color: "var(--accent)" }} aria-hidden="true">◆</span> Landmark only
            </button>
          }
        />
        <div className={query.isFetching && query.data ? "ta-tblwrap dim" : "ta-tblwrap"}>
          <table className={`tbl lt ${settings.density}`} aria-label="Decisions">
            <thead>
              <tr>
                {th("decided", "Decided", { width: 100 })}
                {th("jurisdiction", "Jurisdiction", { width: 170, hidden: !show("jurisdiction"), first: "asc" })}
                {th("case", "Case · court", { first: "asc" })}
                <Th width={48} hidden={!show("lang")}>Lang</Th>
                <Th width={140} hidden={!show("tax_types")}>Tax types</Th>
                {th("significance", "Sig", { width: 112, hidden: !show("sig"), first: "asc" })}
                {th("outcome", "Outcome", { width: 118, hidden: !show("outcome"), first: "asc" })}
                <Th width={160} hidden={!show("cite")}>Citation / docket</Th>
                <Th width={150} hidden={!show("source")}>Source</Th>
                <Th width={160} hidden={!show("tags")}>Tags</Th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <SkeletonRows cols={cols} />
              ) : query.isError ? (
                <ErrorRow cols={cols} error={query.error} noun="court decisions" onRetry={() => query.refetch()} />
              ) : items.length === 0 ? (
                <MessageRow cols={cols}>
                  No decisions match{active ? " these filters" : ""}. <span className="ta-faint">Try clearing some filters.</span>
                  {active > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Clear filters</button>}
                </MessageRow>
              ) : (
                items.map((d) => {
                  const tts = d.tax_types ?? [];
                  return (
                    <tr key={d.id} className="row-link" aria-selected={open === d.id} onClick={() => openRow(d.id)}>
                      <td className="date">{fmtDate(d.decision_date)}</td>
                      {show("jurisdiction") && <td><JRef j={d.jurisdiction} /></td>}
                      <td className="title">
                        <BilingualCell title={d.case_name} titleEn={d.case_name_en} lang={d.lang} sub={d.court} subTitle={d.court} />
                      </td>
                      {show("lang") && <td className="code"><LangTag lang={d.lang} /></td>}
                      {show("tax_types") && (
                        <td className="text" title={tts.map((t) => label(TAX_TYPE_LABEL, t)).join(", ")}>
                          {tts.slice(0, 3).map((t) => ABBR[t] ?? t).join(" · ")}
                          {tts.length > 3 && <span className="mono ta-faint"> +{tts.length - 3}</span>}
                          {tts.length === 0 && "—"}
                        </td>
                      )}
                      {show("sig") && <td><SignificanceMark level={d.significance} /></td>}
                      {show("outcome") && <td><StatusMarker value={d.outcome} /></td>}
                      {show("cite") && <td className="code" title={[d.citation, d.docket].filter(Boolean).join(" · ")}><span className="truncate" style={{ display: "block", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>{d.citation ?? d.docket ?? "—"}</span></td>}
                      {show("source") && <td className="src"><SourceLink href={d.source_url} /></td>}
                      {show("tags") && <td className="text" style={{ color: "var(--ink-3)", fontSize: "var(--text-xs)" }}>{d.tags?.join(", ") || "—"}</td>}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {query.data && <TableFoot total={query.data.total} limit={limit} offset={offset} onOffset={(o) => set({ offset: o })} onLimit={(l) => set({ limit: l, offset: 0 })} />}
      </TableRegion>
      <div className="ta-prov">
        Significance: <span className="ta-sig" data-level="landmark">landmark</span> · <span className="ta-sig" data-level="significant">significant</span> · <span className="ta-sig" data-level="routine">routine</span>. Outcome is classified editorially from the holding; verify against the judgment text.
      </div>
    </PushLayout>
  );
}

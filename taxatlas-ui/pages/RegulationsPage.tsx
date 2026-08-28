import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/taxatlas-ui/lib/api";
import { fmtDate, fmtDateTime, fmtInt } from "@/taxatlas-ui/lib/format";
import { DOC_TYPES, REG_STATUSES, TAX_TYPES, TAX_TYPE_LABEL, label, titleCaseOptions } from "@/taxatlas-ui/lib/enums";
import { useSearchFilters, type SortDir } from "@/taxatlas-ui/hooks/useSearchFilters";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { PushLayout } from "@/taxatlas-ui/components/detail/DetailPanel";
import { ChipDate, ChipInput, ChipSelect, FilterRow, ResultSentence, SearchChip } from "@/taxatlas-ui/components/detail/FilterChips";
import { ErrorRow, MessageRow, SkeletonRows, TableFoot, TableRegion, Th, Toolbar, useClampOffset, useListKeys, useTableSettings, type ColumnDef } from "@/taxatlas-ui/components/detail/DataTable";
import { StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef, SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { WatchButton } from "@/taxatlas-ui/components/detail/WatchButton";
import { downloadAuthenticated } from "@/taxatlas-ui/components/detail/download";
import { useToast } from "@/taxatlas-ui/components/ui/Toast";
import { RegulationDrawer } from "@/taxatlas-ui/components/drawers/RegulationDrawer";
import { BilingualCell, LangTag } from "@/taxatlas-ui/components/ui/Bilingual";
import { authorityEn } from "@/taxatlas-ui/lib/i18n";

const DEFAULT_SORT = "published";
const SORT_LABEL: Record<string, string> = { published: "published", effective: "effective", title: "title", jurisdiction: "jurisdiction", tax_type: "tax type", status: "status", doc_type: "type", seen: "last seen" };
const KEYS = ["jurisdiction", "tax_type", "status", "doc_type", "q", "published_since"] as const;
const COLUMNS: ColumnDef[] = [
  { key: "published", label: "Published", fixed: true },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "title", label: "Title · authority", fixed: true },
  { key: "lang", label: "Lang" },
  { key: "tax_type", label: "Tax type" },
  { key: "doc_type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "effective", label: "Effective", num: true },
  { key: "source", label: "Source" },
  { key: "tags", label: "Tags", hidden: true },
  { key: "first_seen", label: "First seen", hidden: true },
  { key: "last_seen", label: "Last seen", hidden: true },
];

export default function RegulationsPage() {
  usePageTitle("Regulations");
  const { filters, limit, offset, open, sort, dir, set, reset, active } = useSearchFilters(KEYS);
  const toast = useToast();
  const settings = useTableSettings("regulations", COLUMNS);
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
    queryKey: ["regulations", filters, sort, dir, limit, offset],
    queryFn: () => api.regulations.list({ ...filters, sort, dir, limit, offset }),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats.overview, staleTime: 300_000 });
  // Sources carry the English authority name (authority_en); regulations only reference the source.
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => api.sources.list(), staleTime: 300_000 });
  const srcById = useMemo(() => new Map((sources.data ?? []).map((s) => [s.id, s])), [sources.data]);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const ids = useMemo(() => items.map((r) => r.id), [items]);
  const idx = open == null ? -1 : ids.indexOf(open);

  const openRow = useCallback((id: number) => set({ open: id }), [set]);
  const close = useCallback(() => set({ open: null }), [set]);
  const goOffset = useCallback((o: number) => set({ offset: o }), [set]);
  useClampOffset(query.data?.total, offset, limit, goOffset);
  const prevPage = useCallback(() => offset > 0 && set({ offset: Math.max(0, offset - limit) }), [offset, limit, set]);
  const nextPage = useCallback(() => query.data && offset + limit < query.data.total && set({ offset: offset + limit }), [offset, limit, set, query.data]);
  useListKeys({ ids, selected: open, onSelect: openRow, onClose: close, onPrevPage: prevPage, onNextPage: nextPage });

  const cols = settings.visible.length;
  const exportCsv = () => downloadAuthenticated(`/export/regulations.csv${qs({ ...filters, sort, dir })}`, "regulations.csv").catch((e) => toast.error(e));

  return (
    <PushLayout panel={<RegulationDrawer id={open} onClose={close} onPrev={idx > 0 ? () => openRow(ids[idx - 1]) : undefined} onNext={idx >= 0 && idx < ids.length - 1 ? () => openRow(ids[idx + 1]) : undefined} />}>
      <div className="ta-head">
        <div>
          <h1>Regulations</h1>
          <div className="sub">
            Statutes, regulations, rulings, directives and guidance
            {stats.data && (
              <>
                {" · "}<span className="num">{fmtInt(stats.data.regulations)}</span> tracked across <span className="num">{fmtInt(stats.data.sources)}</span> sources
              </>
            )}
          </div>
        </div>
        <div className="ta-actions">
          <button type="button" className="btn" onClick={exportCsv} disabled={items.length === 0} title="Server CSV of every matching row (current filters and sort; up to 5,000 rows)">
            Export CSV
          </button>
          {filters.jurisdiction ? <WatchButton code={filters.jurisdiction} taxType={filters.tax_type || null} long /> : <button type="button" className="btn btn-ghost" disabled title="Add a Jurisdiction filter to watch this view">Watch this view</button>}
        </div>
      </div>

      <FilterRow>
        <SearchChip value={filters.q} onCommit={(v) => set({ q: v })} placeholder="Title or summary · searches original and English" width={300} />
        <ChipInput label="Jurisdiction" value={filters.jurisdiction} onChange={(v) => set({ jurisdiction: v })} placeholder="e.g. EU" code />
        <ChipSelect label="Tax type" value={filters.tax_type} onChange={(v) => set({ tax_type: v })} options={TAX_TYPES.map((t) => ({ value: t, label: TAX_TYPE_LABEL[t] }))} />
        <ChipSelect label="Status" value={filters.status} onChange={(v) => set({ status: v })} options={titleCaseOptions(REG_STATUSES)} />
        <ChipSelect label="Doc type" value={filters.doc_type} onChange={(v) => set({ doc_type: v })} options={titleCaseOptions(DOC_TYPES)} />
        <ChipDate label="Published since" shortLabel="Published" value={filters.published_since} onChange={(v) => set({ published_since: v })} />
        <ResultSentence shown={query.data?.total} total={stats.data?.regulations} active={active} onReset={reset} />
      </FilterRow>

      <TableRegion>
        <Toolbar sortLabel={sortLabel} settings={settings} />
        <div className={query.isFetching && query.data ? "ta-tblwrap dim" : "ta-tblwrap"}>
          <table className={`tbl lt ${settings.density}`} aria-label="Regulations">
            <thead>
              <tr>
                {th("published", "Published", { width: 100 })}
                {th("jurisdiction", "Jurisdiction", { width: 170, hidden: !show("jurisdiction"), first: "asc" })}
                {th("title", "Title · authority", { first: "asc" })}
                <Th width={48} hidden={!show("lang")}>Lang</Th>
                {th("tax_type", "Tax type", { width: 126, hidden: !show("tax_type"), first: "asc" })}
                {th("doc_type", "Type", { width: 92, hidden: !show("doc_type"), first: "asc" })}
                {th("status", "Status", { width: 110, hidden: !show("status"), first: "asc" })}
                {th("effective", "Effective", { width: 100, num: true, hidden: !show("effective") })}
                <Th width={150} hidden={!show("source")}>Source</Th>
                <Th width={160} hidden={!show("tags")}>Tags</Th>
                <Th width={130} hidden={!show("first_seen")}>First seen</Th>
                {th("seen", "Last seen", { width: 130, hidden: !show("last_seen") })}
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <SkeletonRows cols={cols} />
              ) : query.isError ? (
                <ErrorRow cols={cols} error={query.error} noun="regulations" onRetry={() => query.refetch()} />
              ) : items.length === 0 ? (
                <MessageRow cols={cols}>
                  No regulations match{active ? " these filters" : ""}. <span className="ta-faint">Try clearing some filters.</span>
                  {active > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Clear filters</button>}
                </MessageRow>
              ) : (
                items.map((r) => (
                  <tr key={r.id} className="row-link" aria-selected={open === r.id} onClick={() => openRow(r.id)}>
                    <td className="date">{fmtDate(r.published_date)}</td>
                    {show("jurisdiction") && <td><JRef j={r.jurisdiction} /></td>}
                    <td className="title">
                      <BilingualCell
                        title={r.title}
                        titleEn={r.title_en}
                        lang={r.lang}
                        sub={(r.authority || r.reference) ? [r.authority, r.reference].filter(Boolean).join(" · ") : undefined}
                        subTitle={[r.authority, r.reference].filter(Boolean).join(" · ") || undefined}
                        subEn={authorityEn(r, r.source_id != null ? srcById.get(r.source_id) : null)}
                      />
                    </td>
                    {show("lang") && <td className="code"><LangTag lang={r.lang} /></td>}
                    {show("tax_type") && <td className="text">{label(TAX_TYPE_LABEL, r.tax_type)}</td>}
                    {show("doc_type") && <td className="text">{label({}, r.doc_type)}</td>}
                    {show("status") && <td><StatusMarker value={r.status} /></td>}
                    {show("effective") && <td className="date num">{fmtDate(r.effective_date)}</td>}
                    {show("source") && <td className="src"><SourceLink href={r.source_url} /></td>}
                    {show("tags") && <td className="text" style={{ color: "var(--ink-3)", fontSize: "var(--text-xs)" }}>{r.tags?.join(", ") || "—"}</td>}
                    {show("first_seen") && <td className="date">{fmtDateTime(r.first_seen_at)}</td>}
                    {show("last_seen") && <td className="date">{fmtDateTime(r.last_seen_at)}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {query.data && <TableFoot total={query.data.total} limit={limit} offset={offset} onOffset={(o) => set({ offset: o })} onLimit={(l) => set({ limit: l, offset: 0 })} />}
      </TableRegion>
      <div className="ta-prov">Regulations are collected from official publishers on the schedule shown under Sources. Status is as published; verify against the primary authority before reliance.</div>
    </PushLayout>
  );
}

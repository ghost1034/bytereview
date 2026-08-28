import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api, qs } from "@/taxatlas-ui/lib/api";
import { fmtDate, fmtInt, fmtRate } from "@/taxatlas-ui/lib/format";
import { MEASURE_STATUSES, TARIFF_MEASURES, TARIFF_MEASURE_LABEL, label, titleCaseOptions } from "@/taxatlas-ui/lib/enums";
import { copyText } from "@/taxatlas-ui/lib/utils";
import type { TariffOut } from "@/taxatlas-ui/lib/types";
import { useSearchFilters, type SortDir } from "@/taxatlas-ui/hooks/useSearchFilters";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { PushLayout } from "@/taxatlas-ui/components/detail/DetailPanel";
import { ChipDate, ChipInput, ChipSelect, FilterRow, ResultSentence, SearchChip } from "@/taxatlas-ui/components/detail/FilterChips";
import { ErrorRow, MessageRow, SkeletonRows, TableFoot, TableRegion, Th, Toolbar, useClampOffset, useListKeys, useTableSettings, type ColumnDef } from "@/taxatlas-ui/components/detail/DataTable";
import { CountPill, StatusMarker } from "@/taxatlas-ui/components/detail/Marker";
import { JRef, SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { WatchButton } from "@/taxatlas-ui/components/detail/WatchButton";
import { downloadAuthenticated } from "@/taxatlas-ui/components/detail/download";
import { useToast } from "@/taxatlas-ui/components/ui/Toast";
import { TariffDrawer } from "@/taxatlas-ui/components/drawers/TariffDrawer";
import { BilingualCell, LangTag } from "@/taxatlas-ui/components/ui/Bilingual";

const DEFAULT_SORT = "effective";
const SORT_LABEL: Record<string, string> = { effective: "effective", product: "product", importer: "importer", partner: "partner", measure: "measure", rate: "rate", status: "status", hs: "HS code" };
const KEYS = ["importer", "partner", "hs_code", "measure_type", "status", "q", "effective_on"] as const;
const COLUMNS: ColumnDef[] = [
  { key: "effective", label: "Effective", fixed: true },
  { key: "importer", label: "Importer" },
  { key: "partner", label: "Partner" },
  { key: "measure", label: "Measure" },
  { key: "hs", label: "HS" },
  { key: "product", label: "Product / description", fixed: true },
  { key: "lang", label: "Lang" },
  { key: "rate", label: "Rate", num: true },
  { key: "status", label: "Status" },
  { key: "legal", label: "Legal basis", hidden: true },
  { key: "source", label: "Source" },
];
type Group = "none" | "importer" | "partner";

export default function TariffsPage() {
  usePageTitle("Tariffs");
  const { filters, limit, offset, open, sort, dir, group: groupParam, set, reset, active } = useSearchFilters(KEYS);
  const toast = useToast();
  const settings = useTableSettings("tariffs", COLUMNS);
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
  // Grouping is view state in the URL (`?group=importer`) so it survives reload and paging, like sort/density.
  const group: Group = groupParam === "importer" || groupParam === "partner" ? groupParam : "none";
  const setGroup = (g: Group) => set({ group: g === "none" ? null : g });

  const query = useQuery({
    queryKey: ["tariffs", filters, sort, dir, limit, offset],
    queryFn: () => api.tariffs.list({ ...filters, sort, dir, limit, offset }),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats.overview, staleTime: 300_000 });
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

  const grouped = useMemo(() => {
    if (group === "none") return null;
    const key = (t: TariffOut) => (group === "importer" ? t.importing_jurisdiction?.code ?? "—" : t.partner_jurisdiction?.code ?? `— (${t.partner_scope ?? "all"})`);
    const name = (t: TariffOut) => (group === "importer" ? t.importing_jurisdiction?.name ?? "" : t.partner_jurisdiction?.name ?? "");
    const map = new Map<string, { name: string; rows: TariffOut[] }>();
    items.forEach((t) => {
      const k = key(t);
      if (!map.has(k)) map.set(k, { name: name(t), rows: [] });
      map.get(k)!.rows.push(t);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, group]);

  const apiQuery = `/tariffs${qs({ importer: filters.importer, partner: filters.partner, hs_code: filters.hs_code, measure_type: filters.measure_type, status: filters.status, q: filters.q, effective_on: filters.effective_on })}`;
  const exportCsv = () => downloadAuthenticated(`/export/tariffs.csv${qs({ ...filters, sort, dir })}`, "tariffs.csv").catch((e) => toast.error(e));

  const row = (t: TariffOut) => (
    <tr key={t.id} className="row-link" aria-selected={open === t.id} onClick={() => openRow(t.id)}>
      <td className="date">{fmtDate(t.effective_from)}{t.effective_to && <span className="ta-faint"> → {fmtDate(t.effective_to)}</span>}</td>
      {show("importer") && <td><JRef j={t.importing_jurisdiction} /></td>}
      {show("partner") && (
        <td className="text" style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }} title={t.partner_jurisdiction ? undefined : t.partner_scope ?? "all partners"}>
          {t.partner_jurisdiction ? <JRef j={t.partner_jurisdiction} /> : <span className="ta-faint">— ({t.partner_scope ?? "all"})</span>}
        </td>
      )}
      {show("measure") && <td className="text">{label(TARIFF_MEASURE_LABEL, t.measure_type)}</td>}
      {show("hs") && <td className="code">{t.hs_code ?? "—"}</td>}
      <td className="title">
        <BilingualCell
          title={t.product_description}
          titleEn={t.product_description_en}
          lang={t.lang}
          sub={t.notes ?? t.legal_basis ?? undefined}
          subTitle={t.notes ?? t.legal_basis ?? undefined}
          subEn={t.notes ? t.notes_en : null}
        />
      </td>
      {show("lang") && <td className="code"><LangTag lang={t.lang} /></td>}
      {show("rate") && (
        <td className="rate num" title={t.rate_text ?? undefined}>
          {t.rate != null ? <>{fmtRate(t.rate).replace("%", "")}<small>%</small></> : <span className="ta-muted" style={{ fontSize: "var(--text-xs)" }}>{t.rate_text ?? "—"}</span>}
        </td>
      )}
      {show("status") && <td><StatusMarker value={t.status} /></td>}
      {show("legal") && <td className="text" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={t.legal_basis ?? undefined}>{t.legal_basis ?? "—"}</td>}
      {show("source") && <td className="src"><SourceLink href={t.source_url} /></td>}
    </tr>
  );

  return (
    <PushLayout panel={<TariffDrawer id={open} onClose={close} onPrev={idx > 0 ? () => openRow(ids[idx - 1]) : undefined} onNext={idx >= 0 && idx < ids.length - 1 ? () => openRow(ids[idx + 1]) : undefined} />}>
      <div className="ta-head">
        <div>
          <h1>Tariffs</h1>
          <div className="sub">
            MFN, preferential, AD/CVD, Section 232/301, IEEPA, retaliatory and CBAM measures by importer
            {stats.data && <>{" · "}<span className="num">{fmtInt(stats.data.tariffs)}</span> measures</>}
          </div>
        </div>
        <div className="ta-actions">
          <button type="button" className="btn" onClick={exportCsv} disabled={items.length === 0} title="Server CSV of every matching row (current filters and sort; up to 5,000 rows)">Export CSV</button>
          {filters.importer ? <WatchButton code={filters.importer} long /> : <button type="button" className="btn btn-ghost" disabled title="Add an Importer filter to watch this view">Watch this view</button>}
        </div>
      </div>

      <FilterRow>
        <SearchChip value={filters.q} onCommit={(v) => set({ q: v })} placeholder="Product, legal basis, notes · searches original and English" width={330} />
        <ChipInput label="Importer" value={filters.importer} onChange={(v) => set({ importer: v })} placeholder="US" code />
        <ChipInput label="Partner" value={filters.partner} onChange={(v) => set({ partner: v })} placeholder="CN" code />
        <ChipSelect label="Measure" value={filters.measure_type} onChange={(v) => set({ measure_type: v })} options={TARIFF_MEASURES.map((m) => ({ value: m, label: TARIFF_MEASURE_LABEL[m] }))} />
        <ChipInput label="HS prefix" value={filters.hs_code} onChange={(v) => set({ hs_code: v })} placeholder="8703" code digits />
        <ChipSelect label="Status" value={filters.status} onChange={(v) => set({ status: v })} options={titleCaseOptions(MEASURE_STATUSES)} />
        <ChipDate label="In force on" op="=" value={filters.effective_on} onChange={(v) => set({ effective_on: v })} />
        <ResultSentence shown={query.data?.total} total={stats.data?.tariffs} active={active} onReset={reset} />
      </FilterRow>

      <TableRegion>
        <Toolbar
          sortLabel={sortLabel}
          settings={settings}
          right={
            <>
              <div className="ta-seg" role="group" aria-label="Group by">
                {(["none", "importer", "partner"] as Group[]).map((g) => (
                  <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)}>
                    {g === "none" ? "No grouping" : `By ${g}`}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyText(`GET /api/taxatlas/v1${apiQuery}`)} title={`Copies GET /api/taxatlas/v1${apiQuery}`}>
                Copy API query
              </button>
            </>
          }
        />
        <div className={query.isFetching && query.data ? "ta-tblwrap dim" : "ta-tblwrap"}>
          <table className={`tbl lt ${settings.density}`} aria-label="Tariffs">
            <thead>
              <tr>
                {th("effective", "Effective", { width: 110 })}
                {th("importer", "Importer", { width: 160, hidden: !show("importer"), first: "asc" })}
                {th("partner", "Partner", { width: 150, hidden: !show("partner"), first: "asc" })}
                {th("measure", "Measure", { width: 120, hidden: !show("measure"), first: "asc" })}
                {th("hs", "HS", { width: 70, hidden: !show("hs"), first: "asc" })}
                {th("product", "Product / description", { first: "asc" })}
                <Th width={48} hidden={!show("lang")}>Lang</Th>
                {th("rate", "Rate", { width: 90, num: true, hidden: !show("rate") })}
                {th("status", "Status", { width: 120, hidden: !show("status"), first: "asc" })}
                <Th width={180} hidden={!show("legal")}>Legal basis</Th>
                <Th width={150} hidden={!show("source")}>Source</Th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <SkeletonRows cols={cols} />
              ) : query.isError ? (
                <ErrorRow cols={cols} error={query.error} noun="tariff measures" onRetry={() => query.refetch()} />
              ) : items.length === 0 ? (
                <MessageRow cols={cols}>
                  No tariff measures match{active ? " these filters" : ""}. <span className="ta-faint">Try clearing some filters.</span>
                  {active > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Clear filters</button>}
                </MessageRow>
              ) : grouped ? (
                grouped.map(([k, g]) => (
                  <GroupRows key={k} code={k} name={g.name} cols={cols} rows={g.rows} render={row} />
                ))
              ) : (
                items.map(row)
              )}
            </tbody>
          </table>
        </div>
        {query.data && <TableFoot total={query.data.total} limit={limit} offset={offset} onOffset={(o) => set({ offset: o })} onLimit={(l) => set({ limit: l, offset: 0 })} />}
      </TableRegion>
      <div className="ta-prov">Rates are ad valorem unless a rate text is shown; HS codes are 2–6 digit prefixes as published. Partner “— (all)” means the measure applies erga omnes.</div>
    </PushLayout>
  );
}

function GroupRows({ code, name, cols, rows, render }: { code: string; name: string; cols: number; rows: TariffOut[]; render: (t: TariffOut) => React.ReactNode }) {
  return (
    <>
      <tr className="grp">
        <td colSpan={cols}>
          <span className="mono" style={{ color: "var(--ink-2)", letterSpacing: 0, textTransform: "none" }}>{code}</span> {name} <CountPill n={rows.length} />
        </td>
      </tr>
      {rows.map(render)}
    </>
  );
}

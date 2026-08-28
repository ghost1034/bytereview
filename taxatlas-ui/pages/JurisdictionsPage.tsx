/* Jurisdictions gazetteer (pages/jurisdictions.md): every jurisdiction with its headline figures in one table.
   Uses GET /jurisdictions?include=headline (one request, ≤ 1000 rows) and sorts / pages client-side so every
   column — including the rate columns — is sortable with nulls last. */
import { Fragment, useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/taxatlas-ui/lib/navigation";
import { api } from "@/taxatlas-ui/lib/api";
import { fmtInt } from "@/taxatlas-ui/lib/format";
import { LEVELS, LEVEL_LABEL, REGIONS, label, titleCaseOptions } from "@/taxatlas-ui/lib/enums";
import type { JurisdictionOut } from "@/taxatlas-ui/lib/types";
import { useSearchFilters, type SortDir } from "@/taxatlas-ui/hooks/useSearchFilters";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { PushLayout } from "@/taxatlas-ui/components/detail/DetailPanel";
import { ChipSelect, FilterRow, ResultSentence, SearchChip } from "@/taxatlas-ui/components/detail/FilterChips";
import { ErrorRow, MessageRow, SkeletonRows, TableFoot, TableRegion, Th, Toolbar, downloadCsv, useClampOffset, useListKeys, useTableSettings, type ColumnDef } from "@/taxatlas-ui/components/detail/DataTable";
import { CountPill } from "@/taxatlas-ui/components/detail/Marker";
import { SourceLink } from "@/taxatlas-ui/components/detail/JRef";
import { EnLine } from "@/taxatlas-ui/components/ui/Bilingual";

interface Headline {
  vat_standard: number | null;
  sales_use_standard: number | null;
  cit_headline: number | null;
  pit_top: number | null;
  wht_dividends: number | null;
}
type Row = JurisdictionOut & { headline?: Headline | null; children_count?: number };

const KEYS = ["q", "level", "region", "parent"] as const;
const COLUMNS: ColumnDef[] = [
  { key: "code", label: "Code", fixed: true },
  { key: "name", label: "Name", fixed: true },
  { key: "level", label: "Level" },
  { key: "region", label: "Region" },
  { key: "currency", label: "Currency" },
  { key: "vat", label: "VAT std", num: true },
  { key: "sales", label: "Sales & use", num: true, hidden: true },
  { key: "cit", label: "CIT headline", num: true },
  { key: "pit", label: "PIT top", num: true },
  { key: "wht", label: "WHT div.", num: true, hidden: true },
  { key: "sub", label: "Sub-national" },
  { key: "authority", label: "Tax authority", hidden: true },
];
type SortKey = "code" | "name" | "level" | "region" | "currency" | "vat" | "sales" | "cit" | "pit" | "wht";

function rateCell(v: number | null | undefined) {
  if (v == null) return <span className="ta-faint">—</span>;
  const digits = Number.isInteger(v) ? 1 : Math.min(3, (String(v).split(".")[1] ?? "").length);
  return (
    <>
      {v.toFixed(Math.max(1, digits))}<small>%</small>
    </>
  );
}

function sortRows(rows: Row[], key: SortKey, dir: SortDir): Row[] {
  const num = (r: Row, k: keyof Headline) => r.headline?.[k] ?? null;
  const get = (r: Row): string | number | null => {
    switch (key) {
      case "vat": return num(r, "vat_standard");
      case "sales": return num(r, "sales_use_standard");
      case "cit": return num(r, "cit_headline");
      case "pit": return num(r, "pit_top");
      case "wht": return num(r, "wht_dividends");
      case "level": return LEVELS.indexOf(r.level);
      default: return (r[key] as string | null) ?? null;
    }
  };
  const s = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return a.name.localeCompare(b.name);
    if (va == null) return 1; // nulls last regardless of direction
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * s || a.name.localeCompare(b.name);
    return String(va).localeCompare(String(vb)) * s || a.name.localeCompare(b.name);
  });
}

export default function JurisdictionsPage() {
  usePageTitle("Jurisdictions");
  const nav = useNavigate();
  const { filters, limit, offset, sort, dir, group: groupParam, set, reset, toggleSort, active } = useSearchFilters(KEYS, 100);
  const settings = useTableSettings("jurisdictions", COLUMNS);
  const show = settings.show;
  const sortKey = (sort || "name") as SortKey;
  const sortDir: SortDir = sort ? dir : "asc";
  // "By region" grouping lives in the URL (`?group=region`) so it survives reload and paging.
  const group = groupParam === "region";
  const setGroup = (on: boolean) => set({ group: on ? "region" : null });
  const [expanded, setExpanded] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ["jurisdictions", filters, "headline"],
    queryFn: () => api.jurisdictions.list({ ...filters, include: "headline", limit: 1000 }),
    placeholderData: keepPreviousData,
    staleTime: 600_000,
  });
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats.overview, staleTime: 300_000 });
  // Region options come from the data (BUG-01): keys of by_region with rows, "unknown" hidden; enums.REGIONS is the fallback.
  const regionOptions = useMemo(() => {
    const src = stats.data?.by_region;
    const keys = src ? Object.entries(src).filter(([k, n]) => k && k !== "unknown" && n > 0).map(([k]) => k).sort() : REGIONS;
    return keys.map((r) => ({ value: r, label: r }));
  }, [stats.data]);

  const sorted = useMemo(() => sortRows((query.data?.items ?? []) as Row[], sortKey, sortDir), [query.data, sortKey, sortDir]);
  const total = query.data?.total ?? 0;
  const page = useMemo(() => sorted.slice(offset, offset + limit), [sorted, offset, limit]);
  const goOffset = useCallback((o: number) => set({ offset: o }), [set]);
  useClampOffset(query.data?.total, offset, limit, goOffset);
  const children = useQueries({
    queries: expanded.map((code) => ({ queryKey: ["jurisdictions", { parent: code }, "headline"], queryFn: () => api.jurisdictions.list({ parent: code, include: "headline", limit: 200 }), staleTime: 600_000 })),
  });
  const childRows = useMemo(() => {
    const m = new Map<string, Row[]>();
    expanded.forEach((code, i) => m.set(code, ((children[i]?.data?.items ?? []) as Row[])));
    return m;
  }, [expanded, children]);

  const ids = useMemo(() => page.map((j) => j.id), [page]);
  const [selected, setSelected] = useState<number | null>(null);
  const openRow = useCallback((id: number) => {
    const j = page.find((x) => x.id === id) ?? Array.from(childRows.values()).flat().find((x) => x.id === id);
    if (j) nav(`/jurisdictions/${encodeURIComponent(j.code)}`);
  }, [page, childRows, nav]);
  const prevPage = useCallback(() => offset > 0 && set({ offset: Math.max(0, offset - limit) }), [offset, limit, set]);
  const nextPage = useCallback(() => offset + limit < total && set({ offset: offset + limit }), [offset, limit, total, set]);
  useListKeys({ ids, selected, onSelect: setSelected, onOpen: openRow, onPrevPage: prevPage, onNextPage: nextPage });

  const cols = settings.visible.length;
  const th = (key: SortKey, text: string, opts?: { num?: boolean; width?: number; hidden?: boolean; firstDir?: SortDir }) => (
    <Th key={key} num={opts?.num} width={opts?.width} hidden={opts?.hidden} sort={sortKey === key ? sortDir : null} onSort={() => toggleSort(key, opts?.firstDir ?? (opts?.num ? "desc" : "asc"))}>
      {text}
    </Th>
  );

  const exportCsv = () =>
    downloadCsv(
      "jurisdictions.csv",
      ["code", "name", "level", "region", "currency", "iso_alpha3", "iso_numeric", "vat_standard", "sales_use_standard", "cit_headline", "pit_top", "wht_dividends", "has_subnational_taxes"],
      sorted.map((j) => [j.code, j.name, j.level, j.region, j.currency, j.iso_alpha3, j.iso_numeric, j.headline?.vat_standard, j.headline?.sales_use_standard, j.headline?.cit_headline, j.headline?.pit_top, j.headline?.wht_dividends, j.has_subnational_taxes ? "yes" : "no"]),
    );

  const onRowClick = (j: Row, e: React.MouseEvent) => {
    if (e.shiftKey) nav(`/map?sel=${encodeURIComponent(j.code)}`);
    else nav(`/jurisdictions/${encodeURIComponent(j.code)}`);
  };

  const renderRow = (j: Row, child?: boolean) => {
    const n = j.children_count ?? 0;
    const isOpen = expanded.includes(j.code);
    return (
      <tr key={j.id} className={child ? "row-link child" : "link"} aria-selected={selected === j.id} onClick={(e) => onRowClick(j, e)} onFocus={() => setSelected(j.id)}>
        <td className="code">{j.code}</td>
        <td className={n > 0 ? "expand" : undefined}>
          {j.name}
          {n > 0 && (
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${n} sub-jurisdictions of ${j.name}`}
              title={`${n} sub-jurisdictions`}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((x) => (isOpen ? x.filter((c) => c !== j.code) : [...x, j.code]));
              }}
            >
              {isOpen ? "▾" : "▸"}{n}
            </button>
          )}
        </td>
        {show("level") && <td className="text">{label(LEVEL_LABEL, j.level)}</td>}
        {show("region") && <td className="text">{j.region ?? "—"}</td>}
        {show("currency") && <td className="code">{j.currency ?? "—"}</td>}
        {show("vat") && <td className="rate num">{rateCell(j.headline?.vat_standard)}</td>}
        {show("sales") && <td className="rate num">{rateCell(j.headline?.sales_use_standard)}</td>}
        {show("cit") && <td className="rate num">{rateCell(j.headline?.cit_headline)}</td>}
        {show("pit") && <td className="rate num">{rateCell(j.headline?.pit_top)}</td>}
        {show("wht") && <td className="rate num">{rateCell(j.headline?.wht_dividends)}</td>}
        {show("sub") && <td className="text">{j.has_subnational_taxes ? "yes" : <span className="ta-faint">—</span>}</td>}
        {show("authority") && (
          <td className="src" style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }} title={[j.tax_authority_name, j.tax_authority_name_en].filter(Boolean).join("\n") || undefined}>
            {j.tax_authority_url ? <SourceLink href={j.tax_authority_url}><span dir="auto">{j.tax_authority_name ?? undefined}</span></SourceLink> : <span className="ta-faint" dir="auto">{j.tax_authority_name ?? "—"}</span>}
            <EnLine text={j.tax_authority_name_en} table />
          </td>
        )}
      </tr>
    );
  };

  const groups = useMemo(() => {
    if (!group) return null;
    const m = new Map<string, Row[]>();
    page.forEach((j) => {
      const k = j.region ?? "Unassigned";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(j);
    });
    return Array.from(m.entries());
  }, [page, group]);

  return (
    <PushLayout>
      <div className="ta-head">
        <div>
          <h1>Jurisdictions</h1>
          <div className="sub">
            {stats.data ? (
              <>
                <span className="num">{fmtInt(stats.data.jurisdictions)}</span> tracked · <span className="num">{fmtInt(stats.data.countries)}</span> countries · <span className="num">{fmtInt(stats.data.subnational)}</span> sub-national
              </>
            ) : (
              "Countries, supranational bodies and sub-national units with tax competence"
            )}
          </div>
        </div>
        <div className="ta-actions">
          <button type="button" className="btn" onClick={exportCsv} disabled={sorted.length === 0} title="CSV of all matching rows with headline rates">Export CSV</button>
        </div>
      </div>

      <FilterRow>
        <SearchChip value={filters.q} onCommit={(v) => set({ q: v })} placeholder="Name or code…" width={280} />
        <ChipSelect label="Level" value={filters.level} onChange={(v) => set({ level: v })} options={titleCaseOptions(LEVELS)} />
        <ChipSelect label="Region" value={filters.region} onChange={(v) => set({ region: v })} options={regionOptions} />
        {filters.parent && (
          <span className="ta-chip">
            <span className="lbl">Parent</span>
            <b className="code">{filters.parent}</b>
            <button type="button" className="x" aria-label="Remove filter" title="Remove Parent filter" onClick={() => set({ parent: "" })}>
              <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
            </button>
          </span>
        )}
        <ResultSentence shown={query.data?.total} total={stats.data?.jurisdictions} active={active} onReset={reset} />
      </FilterRow>

      <TableRegion>
        <Toolbar
          sortLabel={<b>{COLUMNS.find((c) => c.key === sortKey)?.label.toLowerCase() ?? sortKey} {sortDir === "asc" ? "↑" : "↓"}</b>}
          settings={settings}
          right={
            <div className="ta-seg" role="group" aria-label="Group rows">
              <button type="button" aria-pressed={!group} onClick={() => setGroup(false)}>Flat</button>
              <button type="button" aria-pressed={group} onClick={() => setGroup(true)}>By region</button>
            </div>
          }
        />
        <div className={query.isFetching && query.data ? "ta-tblwrap dim" : "ta-tblwrap"}>
          <table className={`tbl lt ${settings.density}`} aria-label="Jurisdictions">
            <thead>
              <tr>
                {th("code", "Code", { width: 80 })}
                {th("name", "Name")}
                {th("level", "Level", { width: 110, hidden: !show("level") })}
                {th("region", "Region", { width: 130, hidden: !show("region") })}
                {th("currency", "Currency", { width: 84, hidden: !show("currency") })}
                {th("vat", "VAT std", { num: true, width: 92, hidden: !show("vat") })}
                {th("sales", "Sales & use", { num: true, width: 100, hidden: !show("sales") })}
                {th("cit", "CIT headline", { num: true, width: 108, hidden: !show("cit") })}
                {th("pit", "PIT top", { num: true, width: 92, hidden: !show("pit") })}
                {th("wht", "WHT div.", { num: true, width: 92, hidden: !show("wht") })}
                <Th width={100} hidden={!show("sub")}>Sub-national</Th>
                <Th width={240} hidden={!show("authority")}>Tax authority</Th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <SkeletonRows cols={cols} />
              ) : query.isError ? (
                <ErrorRow cols={cols} error={query.error} noun="jurisdictions" onRetry={() => query.refetch()} />
              ) : page.length === 0 ? (
                <MessageRow cols={cols}>
                  No jurisdictions match{active ? " these filters" : ""}.{active > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Clear filters</button>}
                </MessageRow>
              ) : groups ? (
                groups.map(([region, rows]) => (
                  <Fragment key={region}>
                    <tr className="grp">
                      <td colSpan={cols}>
                        <span>{region}</span> <CountPill n={rows.length} />
                      </td>
                    </tr>
                    {rows.map((j) => (
                      <Fragment key={j.id}>
                        {renderRow(j)}
                        {expanded.includes(j.code) && childRows.get(j.code)?.map((c) => renderRow(c, true))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))
              ) : (
                page.map((j) => (
                  <Fragment key={j.id}>
                    {renderRow(j)}
                    {expanded.includes(j.code) && childRows.get(j.code)?.map((c) => renderRow(c, true))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {query.data && <TableFoot total={total} limit={limit} offset={offset} onOffset={(o) => set({ offset: o })} onLimit={(l) => set({ limit: l, offset: 0 })} rowsOptions={[50, 100, 200, 500]} />}
      </TableRegion>
      <div className="ta-prov">Headline rates are the current standard VAT/GST, corporate income headline and top marginal personal income rates; “—” where the tax does not apply or is not tracked. Shift-click a row to open it on the map.</div>
    </PushLayout>
  );
}

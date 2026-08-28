/* Global search / command palette (components.md §2).
 * ⌘K / Ctrl+K toggles. Prefix scopes: `j:` jurisdictions · `r:` regulations · `c:` court decisions · `t:` tariffs ·
 * `>` page actions. Without a prefix all groups appear in that order. Results fetched debounced (120 ms); a 1 px brass
 * progress line under the input indicates loading. Recent items (last 8) show when the query is empty. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "@/taxatlas-ui/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/taxatlas-ui/lib/api";
import { fmtDate } from "@/taxatlas-ui/lib/format";
import { TAX_TYPE_LABEL, TARIFF_MEASURE_LABEL, label } from "@/taxatlas-ui/lib/enums";
import { copyText } from "@/taxatlas-ui/lib/utils";
import { cycleTheme } from "@/taxatlas-ui/hooks/useTheme";
import { useDebounced } from "@/taxatlas-ui/hooks/useDebounced";
import { Kbd, MOD } from "@/taxatlas-ui/components/ui/Kbd";
import { BidiSegments, Bilingual } from "@/taxatlas-ui/components/ui/Bilingual";

// ---------------------------------------------------------------- imperative store
type Listener = (s: { open: boolean; initial: string }) => void;
let paletteState = { open: false, initial: "" };
const listeners = new Set<Listener>();
function emit() {
  listeners.forEach((l) => l(paletteState));
}
/** Open the palette, optionally pre-filled (e.g. `"j:"` to search jurisdictions, `">"` for page actions). */
export function openPalette(initial = ""): void {
  paletteState = { open: true, initial };
  emit();
}
export function closePalette(): void {
  paletteState = { ...paletteState, open: false };
  emit();
}
export function togglePalette(): void {
  paletteState = { open: !paletteState.open, initial: "" };
  emit();
}

// ---------------------------------------------------------------- types
type Scope = "j" | "r" | "c" | "t" | ">" | null;
interface Item {
  key: string;
  glyph: string;
  title: string;
  /** Original-language code and English rendering for crawled titles (regulations, cases, tariffs). */
  lang?: string | null;
  titleEn?: string | null;
  sub?: string;
  meta?: string;
  to?: string;
  run?: () => void;
}
interface Group {
  key: string;
  label: string;
  items: Item[];
  total?: number;
  showAllTo?: string;
}

const RECENT_KEY = "ta.recent";
function readRecent(): Item[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Item[];
    return Array.isArray(v) ? v.filter((i) => i && i.to && i.title) : [];
  } catch {
    return [];
  }
}
function pushRecent(item: Item): void {
  if (!item.to) return;
  const next = [{ key: item.key, glyph: item.glyph, title: item.title, lang: item.lang, titleEn: item.titleEn, sub: item.sub, meta: item.meta, to: item.to }, ...readRecent().filter((r) => r.to !== item.to)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function parse(q: string): { scope: Scope; term: string } {
  const m = q.match(/^([jrct]):\s*(.*)$/i);
  if (m) return { scope: m[1].toLowerCase() as Scope, term: m[2].trim() };
  if (q.startsWith(">")) return { scope: ">", term: q.slice(1).trim() };
  return { scope: null, term: q.trim() };
}

const PAGES: Array<{ label: string; to: string }> = [
  { label: "Map", to: "/map" },
  { label: "Overview", to: "/overview" },
  { label: "Jurisdictions", to: "/jurisdictions" },
  { label: "Regulations", to: "/regulations" },
  { label: "Court decisions", to: "/court-decisions" },
  { label: "Tariffs", to: "/tariffs" },
  { label: "Changes", to: "/changes" },
  { label: "Sources", to: "/sources" },
  { label: "Account", to: "/account" },
];

const LIMIT = 6;

export function CommandPalette() {
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(paletteState.open);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Subscribe to the imperative store and the global shortcut.
  useEffect(() => {
    const l: Listener = (s) => {
      setOpen(s.open);
      if (s.open) {
        setQ(s.initial);
        setCursor(0);
      }
    };
    listeners.add(l);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      listeners.delete(l);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const { scope, term } = parse(q);
  const dTerm = useDebounced(term, 120);
  const searching = open && dTerm.length > 0 && scope !== ">";
  const want = (s: Exclude<Scope, ">" | null>) => searching && (scope === null || scope === s);

  const jq = useQuery({ queryKey: ["palette", "j", dTerm], queryFn: () => api.jurisdictions.list({ q: dTerm, limit: LIMIT }), enabled: want("j"), staleTime: 30_000 });
  const rq = useQuery({ queryKey: ["palette", "r", dTerm], queryFn: () => api.regulations.list({ q: dTerm, limit: LIMIT }), enabled: want("r"), staleTime: 30_000 });
  const cq = useQuery({ queryKey: ["palette", "c", dTerm], queryFn: () => api.courtDecisions.list({ q: dTerm, limit: LIMIT }), enabled: want("c"), staleTime: 30_000 });
  const tq = useQuery({ queryKey: ["palette", "t", dTerm], queryFn: () => api.tariffs.list({ q: dTerm, limit: LIMIT }), enabled: want("t"), staleTime: 30_000 });
  const loading = [jq, rq, cq, tq].some((x) => x.isFetching) || (term !== dTerm && searching);

  const close = useCallback(() => closePalette(), []);
  const go = useCallback(
    (item: Item) => {
      closePalette();
      if (item.run) item.run();
      if (item.to) {
        pushRecent(item);
        nav(item.to);
      }
    },
    [nav],
  );

  const actions = useMemo<Item[]>(() => {
    const apiPath = `${window.location.origin}/api/taxatlas/v1${loc.pathname.startsWith("/jurisdictions") ? loc.pathname : ""}`;
    return [
      ...PAGES.map((p) => ({ key: `go-${p.to}`, glyph: "›", title: `Go to ${p.label}`, meta: p.to, to: p.to })),
      { key: "theme", glyph: "›", title: "Toggle theme (dark / light / auto)", run: () => cycleTheme() },
      { key: "copy-api", glyph: "›", title: "Copy API path", sub: apiPath, run: () => void copyText(apiPath) },
      { key: "docs", glyph: "›", title: "Open API docs", sub: "/api/docs", run: () => window.open("/api/docs", "_blank", "noreferrer") },
    ];
  }, [loc.pathname]);

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    if (scope === ">" || (scope === null && term)) {
      const t = term.toLowerCase();
      const hits = actions.filter((a) => !t || a.title.toLowerCase().includes(t));
      if (scope === ">" || hits.length) out.push({ key: "actions", label: "Actions", items: scope === ">" ? hits : hits.slice(0, 3) });
    }
    if (!searching) {
      if (!scope && !term) {
        const rec = readRecent();
        if (rec.length) out.unshift({ key: "recent", label: "Recent", items: rec });
      }
      return out;
    }
    if (want("j") && jq.data)
      out.unshift({
        key: "j",
        label: "Jurisdictions",
        total: jq.data.total,
        showAllTo: `/jurisdictions?q=${encodeURIComponent(dTerm)}`,
        items: jq.data.items.map((x) => ({ key: `j-${x.id}`, glyph: "J", title: x.name, sub: [x.level, x.region].filter(Boolean).join(" · "), meta: x.code, to: `/jurisdictions/${x.code}` })),
      });
    const rest: Group[] = [];
    if (want("r") && rq.data)
      rest.push({
        key: "r",
        label: "Regulations",
        total: rq.data.total,
        showAllTo: `/regulations?q=${encodeURIComponent(dTerm)}`,
        items: rq.data.items.map((x) => ({ key: `r-${x.id}`, glyph: "R", title: x.title, lang: x.lang, titleEn: x.title_en, sub: [x.authority, fmtDate(x.published_date)].filter((s) => s && s !== "—").join(" · "), meta: x.jurisdiction?.code ?? label(TAX_TYPE_LABEL, x.tax_type), to: `/regulations?open=${x.id}` })),
      });
    if (want("c") && cq.data)
      rest.push({
        key: "c",
        label: "Court decisions",
        total: cq.data.total,
        showAllTo: `/court-decisions?q=${encodeURIComponent(dTerm)}`,
        items: cq.data.items.map((x) => ({ key: `c-${x.id}`, glyph: "C", title: x.case_name, lang: x.lang, titleEn: x.case_name_en, sub: [x.court, fmtDate(x.decision_date)].filter((s) => s && s !== "—").join(" · "), meta: x.jurisdiction?.code ?? "", to: `/court-decisions?open=${x.id}` })),
      });
    if (want("t") && tq.data)
      rest.push({
        key: "t",
        label: "Tariffs",
        total: tq.data.total,
        showAllTo: `/tariffs?q=${encodeURIComponent(dTerm)}`,
        items: tq.data.items.map((x) => ({ key: `t-${x.id}`, glyph: "T", title: x.product_description, lang: x.lang, titleEn: x.product_description_en, sub: [label(TARIFF_MEASURE_LABEL, x.measure_type), x.hs_code ? `HS ${x.hs_code}` : null].filter(Boolean).join(" · "), meta: x.importing_jurisdiction?.code ?? "", to: `/tariffs?open=${x.id}` })),
      });
    // Jurisdictions first, then records, then (for unscoped queries) matching actions last.
    const act = out.find((g) => g.key === "actions");
    return [...out.filter((g) => g.key !== "actions"), ...rest, ...(act ? [act] : [])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, term, dTerm, searching, actions, jq.data, rq.data, cq.data, tq.data]);

  // Flatten for keyboard navigation (group "show all" rows included).
  const flat = useMemo<Item[]>(() => {
    const f: Item[] = [];
    groups.forEach((g) => {
      f.push(...g.items);
      if (g.showAllTo && g.total !== undefined && g.total > g.items.length) f.push({ key: `${g.key}-all`, glyph: "→", title: `Show all ${g.total} in ${g.label}`, to: g.showAllTo });
    });
    return f;
  }, [groups]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (flat.length ? (c - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = flat[cursor];
      if (it) go(it);
    }
  };

  const empty = searching && !loading && flat.length === 0;
  let idx = -1;

  return (
    <div className="palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKey}>
        <div className="palette-input">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder="Search jurisdictions, regulations, cases…"
            aria-label="Search"
            aria-autocomplete="list"
            aria-activedescendant={flat[cursor] ? `pal-${flat[cursor].key}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          {scope && <Kbd>{scope === ">" ? "> actions" : `${scope}: ${scopeLabel(scope)}`}</Kbd>}
          {loading && <div className="palette-progress" aria-hidden="true" />}
        </div>
        {!q && (
          <div className="palette-hints">
            <span>
              <Kbd>j:</Kbd>jurisdictions
            </span>
            <span>
              <Kbd>r:</Kbd>regulations
            </span>
            <span>
              <Kbd>c:</Kbd>court decisions
            </span>
            <span>
              <Kbd>t:</Kbd>tariffs
            </span>
            <span>
              <Kbd>&gt;</Kbd>actions
            </span>
          </div>
        )}
        <div className="palette-list" ref={listRef} role="listbox" aria-label="Results">
          {groups.map((g) => (
            <div key={g.key} role="group" aria-label={g.label}>
              <div className="palette-group">{g.label}</div>
              {g.items.map((it) => {
                idx += 1;
                const i = idx;
                return (
                  <button key={it.key} id={`pal-${it.key}`} type="button" role="option" aria-selected={i === cursor} className="palette-row" onMouseEnter={() => setCursor(i)} onClick={() => go(it)}>
                    <span className="g">{it.glyph}</span>
                    <span className="t">
                      {it.lang || it.titleEn ? <Bilingual original={it.title} lang={it.lang} translation={it.titleEn} table /> : it.title}
                      {it.sub && <span className="s"><BidiSegments text={it.sub} lang={it.lang} /></span>}
                    </span>
                    <span className="m">{it.meta}</span>
                  </button>
                );
              })}
              {g.showAllTo && g.total !== undefined && g.total > g.items.length && (() => {
                idx += 1;
                const i = idx;
                const it = flat[i];
                return (
                  <button key={`${g.key}-all`} id={`pal-${g.key}-all`} type="button" role="option" aria-selected={i === cursor} className="palette-row" onMouseEnter={() => setCursor(i)} onClick={() => it && go(it)}>
                    <span className="g">→</span>
                    <span className="t faint">
                      Show all <span className="mono">{g.total}</span> in {g.label}
                    </span>
                    <span className="m">↵</span>
                  </button>
                );
              })()}
            </div>
          ))}
          {empty && <div className="palette-empty">No results for “{term}”.</div>}
          {!searching && groups.length === 0 && <div className="palette-empty">Type to search, or use a prefix to narrow the scope.</div>}
        </div>
        <div className="palette-foot">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span>
            <Kbd>↵</Kbd> open
          </span>
          <span>
            <Kbd>esc</Kbd> close
          </span>
          <span className="ml-auto">
            <Kbd>{MOD}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

function scopeLabel(s: Scope): string {
  return s === "j" ? "jurisdictions" : s === "r" ? "regulations" : s === "c" ? "court decisions" : s === "t" ? "tariffs" : "";
}

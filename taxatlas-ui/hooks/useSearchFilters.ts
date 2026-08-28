import { useCallback, useMemo } from "react";
import { useSearchParams } from "@/taxatlas-ui/lib/navigation";
import { clampInt } from "@/taxatlas-ui/lib/utils";

/** Params that are view state, not filters: changing them keeps the page offset; they do not count as active filters. */
const META_KEYS = new Set(["offset", "limit", "open", "sort", "dir", "tab", "group"]);

export type SortDir = "asc" | "desc";

/** URL-search-param backed filter state for list pages (chip model: every filter is one param).
 *  Changing any filter resets offset to 0; `open`/`sort`/`dir`/`tab` are view state and do not. */
export function useSearchFilters<K extends string>(keys: readonly K[], defaultLimit = 50) {
  const [sp, setSp] = useSearchParams();

  const filters = useMemo(() => {
    const out = {} as Record<K, string>;
    keys.forEach((k) => {
      out[k] = sp.get(k) ?? "";
    });
    return out;
  }, [sp, keys]);

  const limit = clampInt(sp.get("limit"), defaultLimit, 1, 5000);
  const offset = clampInt(sp.get("offset"), 0, 0);
  const openRaw = sp.get("open");
  /** Record open in the drawer (`?open=641`), null when closed. */
  const open = openRaw != null && /^\d+$/.test(openRaw) ? Number(openRaw) : null;
  const sort = sp.get("sort") ?? "";
  const dir: SortDir = sp.get("dir") === "asc" ? "asc" : "desc";
  /** Row grouping (view state, e.g. `?group=importer`); pages validate the value. */
  const group = sp.get("group") ?? "";

  type Patch = Partial<Record<K | "offset" | "limit" | "open" | "sort" | "dir" | "tab" | "group", string | number | null | undefined>>;
  const set = useCallback(
    (patch: Patch) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev);
          let filterChanged = false;
          Object.entries(patch).forEach(([k, v]) => {
            if (!META_KEYS.has(k)) filterChanged = true;
            if (v === undefined || v === null || v === "") next.delete(k);
            else next.set(k, String(v));
          });
          if (filterChanged && !("offset" in patch)) next.delete("offset");
          return next;
        },
        { replace: true },
      );
    },
    [setSp],
  );

  /** Clear every filter but keep view state (sort, density) so the table does not jump. */
  const reset = useCallback(
    () =>
      setSp(
        (prev) => {
          const next = new URLSearchParams();
          ["sort", "dir", "tab", "group"].forEach((k) => {
            const v = prev.get(k);
            if (v) next.set(k, v);
          });
          return next;
        },
        { replace: true },
      ),
    [setSp],
  );

  /** Cycle a sortable column: desc → asc → none (components.md §3). */
  const toggleSort = useCallback(
    (key: string, firstDir: SortDir = "desc") => {
      if (sort !== key) set({ sort: key, dir: firstDir } as Patch);
      else if (dir === firstDir) set({ dir: firstDir === "desc" ? "asc" : "desc" } as Patch);
      else set({ sort: null, dir: null } as Patch);
    },
    [sort, dir, set],
  );

  const active = keys.filter((k) => filters[k] !== "").length;

  return { filters, limit, offset, open, sort, dir, group, set, reset, toggleSort, active };
}

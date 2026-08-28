"""Rate-table adapter: turn a published rate table into observed (code, tax_type, rate_kind, value) items.

The crawler never rewrites reference rates. This adapter only *observes*; the runner's category="rates" branch
compares each observation with the database and raises a proposal ChangeEvent when they differ. Admins apply.

config keys (HTML tables):
  table_selector   CSS for the table (default "table"); table_index picks among matches (default 0)
  header_row       bool; the first row carries column headers (default True). Columns are addressed by header
                   text (case-insensitive substring) or by 0-based index.
  key_column       column holding the jurisdiction name / code / rate label (default 0)
  key_kind         "name" (default; resolved through the name map), "code" (already a jurisdiction code),
                   "label" (rows are rate kinds; see row_map + fixed_code)
  key_scope        restrict the name map to children of this jurisdiction code (e.g. "US" for state tables, "CA",
                   "AU"); default: countries + supranationals
  key_prefix       prepend to resolved codes (rarely needed; key_scope usually suffices)
  name_map         {normalised name: code} overrides (see normalise_name)
  skip_rows        list of regexes; rows whose cleaned key matches are ignored (totals, notes)
  fixed_code       every row belongs to this jurisdiction (HMRC-style "Standard rate / 20%" tables)
  row_select       "first" | "last": use only that data row (rate-history tables where the first/last row is current)
  row_map          {regex on key: rate_kind} for key_kind="label"; with `tax_type` and `value_column`
  columns          {column ref: {"tax_type": ..., "rate_kind": ... | "rate_kinds": [...], "parse": ..., "aggregate": ...,
                    "value_field": "rate" | "threshold_amount"}}
                   parse:  "number" (default; exactly one number in the cell, ranges/NA skipped), "first_number",
                           "amount" (currency amount, spaces/commas as thousands separators), "wht" (PwC
                           "Resident: a / b / c; Non-resident: a / b / c" -> three kinds, non-resident segment)
                   aggregate: "first" (default), "max", "min" — how duplicate (code, tax_type, rate_kind) rows combine
                   (Tax Foundation bracket tables repeat the state per bracket; "max" yields the top marginal rate)
  tax_type_overrides {code: tax_type} — e.g. PwC lists GST countries in the VAT chart; {"AU": "gst"} re-labels them
  text_regex       regex with one capture group applied to the page text; emits a single observation for
                   fixed_code / tax_type / rate_kind (official pages that state the rate in prose)
  format           "json" to read a JSON document instead: items_path (dotted) selects the row list; key_column and
                   column refs are then field names.
  headers          extra request headers

Every observation becomes a RawItem with extra = {code, tax_type, rate_kind, value, value_field, label, raw,
observed_at}. Name-map misses and unparseable cells are reported in FetchResult.notes, never raised.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from datetime import UTC, datetime
from typing import Any

import httpx
from selectolax.parser import HTMLParser, Node

from taxatlas.crawler.adapters.base import BaseAdapter, FetchResult, RawItem
from taxatlas.models import Source

log = logging.getLogger("taxatlas.crawler")

_PAREN_RX = re.compile(r"\s*\([^)]*\)")
_FOOTNOTE_RX = re.compile(r"\s*[\*†‡]+\s*$")
_LEAD_DASH_RX = re.compile(r"^[\s\-–—•]+")
_NUMBER_RX = re.compile(r"(?<![\d.])(\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.(\d+))?")
_PCT_NUMBER_RX = re.compile(r"(\d+(?:\.\d+)?)\s*%?")
MAX_RATE_PERCENT = 100.0  # a "rate" above this is a year or an amount that leaked into the cell
_NA_VALUES = {"", "na", "n/a", "n.a.", "none", "nil", "-", "–", "—", "no vat", "no tax", "not applicable"}
_RANGE_RX = re.compile(r"\d\s*(?:to|–|—|-|~)\s*\d|\bfrom\s+\d.*\bto\s+\d|\bbetween\b|\bup to\b", re.I)

# PwC / common aliases -> ISO code. Keys are normalise_name() output.
_COUNTRY_ALIASES: dict[str, str] = {
    "bahamas": "BS",
    "china": "CN",
    "china peoples republic of": "CN",
    "congo democratic republic of the": "CD",
    "congo republic of": "CG",
    "korea republic of": "KR",
    "korea": "KR",
    "south korea": "KR",
    "gambia": "GM",
    "hong kong sar": "HK",
    "macau sar": "MO",
    "macau": "MO",
    "lao pdr": "LA",
    "ivory coast": "CI",
    "cote divoire": "CI",
    "cabo verde": "CV",
    "cape verde": "CV",
    "eswatini": "SZ",
    "swaziland": "SZ",
    "palestinian territories": "PS",
    "saint lucia": "LC",
    "st lucia": "LC",
    "saint kitts and nevis": "KN",
    "st kitts and nevis": "KN",
    "saint vincent and the grenadines": "VC",
    "st vincent and the grenadines": "VC",
    "timor leste": "TL",
    "turkiye": "TR",
    "turkey": "TR",
    "vietnam": "VN",
    "viet nam": "VN",
    "czech republic": "CZ",
    "czechia": "CZ",
    "slovak republic": "SK",
    "slovakia": "SK",
    "kyrgyzstan": "KG",
    "kyrgyz republic": "KG",
    "north macedonia": "MK",
    "macedonia": "MK",
    "myanmar": "MM",
    "united states": "US",
    "united states of america": "US",
    "usa": "US",
    "united kingdom": "GB",
    "uk": "GB",
    "cameroon republic of": "CM",
    "cameroon": "CM",
    "guernsey channel islands": "GG",
    "jersey channel islands": "JE",
    "moldova": "MD",
    "saudi arabia": "SA",
    "uzbekistan republic of": "UZ",
    "uzbekistan": "UZ",
    "venezuela": "VE",
    "us virgin islands": "VI",
    "kosovo": "XK",
    "russia": "RU",
    "russian federation": "RU",
    "iran": "IR",
    "syria": "SY",
    "tanzania": "TZ",
    "brunei": "BN",
    "brunei darussalam": "BN",
    "laos": "LA",
    "micronesia": "FM",
    "bolivia": "BO",
    "taiwan": "TW",
    "netherlands": "NL",
    "the netherlands": "NL",
    "holy see": "VA",
    "vatican": "VA",
    "dominican republic": "DO",
    "trinidad and tobago": "TT",
    "antigua and barbuda": "AG",
    "bosnia and herzegovina": "BA",
    "equatorial guinea": "GQ",
    "papua new guinea": "PG",
    "new zealand": "NZ",
    "south africa": "ZA",
    "sri lanka": "LK",
    "el salvador": "SV",
    "costa rica": "CR",
    "puerto rico": "PR",
    "cayman islands": "KY",
    "isle of man": "IM",
    "european union": "EU",
    "eu": "EU",
}

_CACHE: dict[str, dict[str, str]] = {}


def normalise_name(name: str) -> str:
    """Lower-case ASCII key for name-map lookups: diacritics, parentheses, footnotes and leading dashes removed."""
    s = _PAREN_RX.sub("", name or "")
    s = _LEAD_DASH_RX.sub("", s)
    s = _FOOTNOTE_RX.sub("", s)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("&", " and ").replace("'", "").replace("’", "")
    s = re.sub(r"[^A-Za-z0-9, ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    if s.endswith(", the"):
        s = "the " + s[:-5]
    if s.startswith("the "):
        s = s[4:]
    return s


def _seed_jurisdictions() -> list[dict]:
    from taxatlas.seed.jurisdictions import JURISDICTIONS

    return JURISDICTIONS


def name_map(scope: str | None = None) -> dict[str, str]:
    """name -> code for countries/supranationals (scope None) or the children of `scope` (e.g. "US" -> states)."""
    key = scope or ""
    cached = _CACHE.get(key)
    if cached is not None:
        return cached
    out: dict[str, str] = {}
    for j in _seed_jurisdictions():
        if scope:
            if j.get("parent_code") != scope:
                continue
        elif j.get("parent_code"):
            continue
        out[normalise_name(j["name"])] = j["code"]
        if scope:
            out[j["code"].split("-", 1)[-1].lower()] = j["code"]  # "CA" -> US-CA, "ON" -> CA-ON
        elif j.get("iso_alpha3"):
            out[j["iso_alpha3"].lower()] = j["code"]
        out[j["code"].lower()] = j["code"]
    if not scope:
        for k, v in _COUNTRY_ALIASES.items():
            out.setdefault(k, v)
    elif scope == "US":
        for k in ("dc", "d c", "washington dc", "washington d c", "washington, d c", "district of columbia"):
            out.setdefault(k, "US-DC")
        # "X, Republic of" / "X, People's Republic of": fall back to the part before the comma
    _CACHE[key] = out
    return out


def resolve_code(raw_key: str, cfg: dict[str, Any]) -> str | None:
    kind = str(cfg.get("key_kind") or "name")
    if kind == "code":
        code = (raw_key or "").strip().upper()
        return (cfg.get("key_prefix") or "") + code if code else None
    n = normalise_name(raw_key)
    if not n:
        return None
    overrides = {normalise_name(k): v for k, v in (cfg.get("name_map") or {}).items()}
    if n in overrides:
        return overrides[n]
    table = name_map(cfg.get("key_scope"))
    code = table.get(n)
    if code is None and "," in n and not cfg.get("key_scope"):
        code = table.get(n.split(",", 1)[0].strip())  # "Korea, Republic of" -> "korea" (countries only)
    if code is None:
        return None
    return (cfg.get("key_prefix") or "") + code


# --------------------------------------------------------------------------------------
# Cell parsing
# --------------------------------------------------------------------------------------
def _to_float(whole: str, frac: str | None) -> float:
    whole = re.sub(r"[ ,]", "", whole)
    return float(f"{whole}.{frac}" if frac else whole)


def parse_number(text: str) -> float | None:
    """Exactly one number in the cell (with or without %); ranges, lists and NA-like cells yield None."""
    t = (text or "").strip()
    if t.lower().rstrip(".") in _NA_VALUES or t.lower() in _NA_VALUES:
        return None
    if _RANGE_RX.search(t):
        return None
    nums = _PCT_NUMBER_RX.findall(t)
    if len(nums) != 1:
        return None
    return float(nums[0])


def parse_first_number(text: str) -> float | None:
    t = (text or "").strip()
    if t.lower() in _NA_VALUES:
        return None
    m = _PCT_NUMBER_RX.search(t)
    return float(m.group(1)) if m else None


def parse_amount(text: str) -> float | None:
    t = (text or "").strip()
    if t.lower() in _NA_VALUES:
        return None
    m = _NUMBER_RX.search(t)
    return _to_float(m.group(1), m.group(2)) if m else None


def parse_wht(text: str) -> list[float | None]:
    """PwC WHT cell -> [dividends, interest, royalties] from the non-resident segment (statutory maximum per slot)."""
    t = text or ""
    seg = t
    m = re.search(r"non-?resident[^:]*:\s*([^;]+)", t, re.I)
    if m:
        seg = m.group(1)
    else:
        m = re.search(r"resident[^:]*:\s*([^;]+)", t, re.I)
        if m:
            seg = m.group(1)
    parts = [p.strip() for p in _PAREN_RX.sub("", seg).split("/")]
    if len(parts) < 3:
        return [None, None, None]
    out: list[float | None] = []
    for p in parts[:3]:
        nums = [float(x) for x in _PCT_NUMBER_RX.findall(p) if float(x) <= MAX_RATE_PERCENT]
        out.append(max(nums) if nums else None)
    return out


_PARSERS = {"number": parse_number, "first_number": parse_first_number, "amount": parse_amount}


# --------------------------------------------------------------------------------------
# Table extraction
# --------------------------------------------------------------------------------------
def _text(node: Node | None) -> str:
    return " ".join(node.text(separator=" ", strip=True).split()) if node is not None else ""


def _rows_from_html(html: str, cfg: dict[str, Any]) -> tuple[list[str], list[list[str]]]:
    tree = HTMLParser(html)
    tables = tree.css(cfg.get("table_selector") or "table")
    idx = int(cfg.get("table_index", 0) or 0)
    if not tables or idx >= len(tables):
        raise ValueError(f"rates_table: no table matched {cfg.get('table_selector') or 'table'!r}[{idx}]")
    rows = [[_text(c) for c in tr.css("th, td")] for tr in tables[idx].css("tr")]
    rows = [r for r in rows if any(r)]
    if not rows:
        raise ValueError("rates_table: table has no rows")
    if cfg.get("header_row", True):
        return rows[0], rows[1:]
    return [], rows


def _rows_from_json(payload: Any, cfg: dict[str, Any]) -> tuple[list[str], list[dict[str, Any]]]:
    from taxatlas.crawler.adapters.json_api import dotted_get

    rows = dotted_get(payload, cfg.get("items_path", ""), default=[])
    if isinstance(rows, dict):
        rows = list(rows.values())
    if not isinstance(rows, list):
        raise ValueError("rates_table: items_path did not select a list")
    return [], [r for r in rows if isinstance(r, dict)]


def _col_index(ref: str | int, headers: list[str]) -> int | None:
    if isinstance(ref, int) or (isinstance(ref, str) and ref.isdigit()):
        return int(ref)
    want = str(ref).strip().lower()
    for i, h in enumerate(headers):
        if h.strip().lower() == want:
            return i
    for i, h in enumerate(headers):
        if want in h.strip().lower():
            return i
    return None


def _cell(row: Any, ref: str | int, headers: list[str]) -> str | None:
    if isinstance(row, dict):
        v = row.get(str(ref))
        return None if v is None else str(v)
    i = _col_index(ref, headers)
    if i is None or i >= len(row):
        return None
    return row[i]


def extract_observations(rows: list[Any], headers: list[str], source: Source) -> tuple[list[dict[str, Any]], list[str]]:
    """Apply the column mapping to table rows. Returns (observations, notes)."""
    cfg = source.config or {}
    columns: dict[str, dict[str, Any]] = cfg.get("columns") or {}
    notes: list[str] = []
    misses: list[str] = []
    unparsed: list[str] = []
    skip_rx = [re.compile(p, re.I) for p in (cfg.get("skip_rows") or [])]
    key_ref = cfg.get("key_column", 0)
    fixed_code = cfg.get("fixed_code")
    row_select = cfg.get("row_select")
    if row_select in ("first", "last") and rows:
        rows = [rows[0] if row_select == "first" else rows[-1]]
    key_kind = str(cfg.get("key_kind") or ("label" if cfg.get("row_map") else "name"))
    row_map = [(re.compile(k, re.I), v) for k, v in (cfg.get("row_map") or {}).items()]
    now = datetime.now(UTC).isoformat(timespec="seconds")

    # (code, tax_type, rate_kind) -> observation; aggregation resolves duplicates
    collected: dict[tuple[str, str, str], dict[str, Any]] = {}

    def put(
        code: str,
        tax_type: str,
        rate_kind: str,
        value: float,
        spec: dict[str, Any],
        label: str,
        raw: str,
        ref: str = "",
    ) -> None:
        key = (code, tax_type, rate_kind, ref)
        agg = str(spec.get("aggregate") or "first")
        prev = collected.get(key)
        if prev is not None:
            if agg == "max" and value <= prev["value"]:
                return
            if agg == "min" and value >= prev["value"]:
                return
            if agg == "first":
                return
        collected[key] = {
            "code": code,
            "tax_type": tax_type,
            "rate_kind": rate_kind,
            "value": value,
            "value_field": str(spec.get("value_field") or "rate"),
            "label": label[:120],
            "raw": raw[:200],
            "observed_at": now,
        }

    for row in rows:
        raw_key = _cell(row, key_ref, headers) if not (fixed_code and key_kind != "label") else None
        if raw_key is None and not fixed_code:
            continue
        label = normalise_name(raw_key) if raw_key else ""
        if skip_rx and any(rx.search(raw_key or "") for rx in skip_rx):
            continue
        if key_kind == "label":
            if not fixed_code:
                raise ValueError("rates_table: key_kind='label' requires fixed_code")
            kind = next((v for rx, v in row_map if rx.search(raw_key or "")), None)
            if kind is None:
                continue
            cell = _cell(row, cfg.get("value_column", 1), headers)
            parser = _PARSERS.get(str(cfg.get("parse") or "number"), parse_number)
            val = parser(cell or "")
            if val is None:
                unparsed.append(f"{raw_key}={cell!r}")
                continue
            put(str(fixed_code), str(cfg.get("tax_type")), kind, val, cfg, raw_key or "", cell or "", "label")
            continue
        code = str(fixed_code) if fixed_code else resolve_code(raw_key or "", cfg)
        if code is None:
            if label and label not in misses:
                misses.append(label)
            continue
        for ref, spec in columns.items():
            cell = _cell(row, ref, headers)
            if cell is None:
                continue
            parse = str(spec.get("parse") or "number")
            tax_type = str((cfg.get("tax_type_overrides") or {}).get(code) or spec.get("tax_type"))
            if parse == "wht":
                kinds = list(spec.get("rate_kinds") or ["dividends", "interest", "royalties"])
                vals = parse_wht(cell)
                if all(v is None for v in vals):
                    unparsed.append(f"{code}:{tax_type}={cell[:60]!r}")
                for kind, val in zip(kinds, vals, strict=False):
                    if val is not None:
                        put(code, tax_type, str(kind), val, spec, raw_key or "", cell, str(ref))
                continue
            parser = _PARSERS.get(parse, parse_number)
            val = parser(cell)
            if val is None or (str(spec.get("value_field") or "rate") == "rate" and val > MAX_RATE_PERCENT):
                unparsed.append(f"{code}:{tax_type}/{spec.get('rate_kind')}={cell[:60]!r}")
                continue
            put(code, tax_type, str(spec.get("rate_kind")), val, spec, raw_key or "", cell, str(ref))

    if misses:
        notes.append(f"name-map misses ({len(misses)}): " + ", ".join(misses[:40]) + (" …" if len(misses) > 40 else ""))
        log.info("rates_table %s: unresolved names: %s", source.slug, misses[:40])
    if unparsed:
        notes.append(
            f"unparsed cells ({len(unparsed)}): " + "; ".join(unparsed[:20]) + (" …" if len(unparsed) > 20 else "")
        )
    return list(collected.values()), notes


def observations_to_items(obs: list[dict[str, Any]], source: Source) -> list[RawItem]:
    items: list[RawItem] = []
    for o in obs:
        unit = "" if o["value_field"] == "threshold_amount" else "%"
        items.append(
            RawItem(
                url=f"{source.url}#{o['code']}:{o['tax_type']}:{o['rate_kind']}",
                title=f"{o['code']} {o['tax_type']} {o['rate_kind']} = {o['value']:g}{unit}",
                summary=o["raw"] or None,
                extra=dict(o),
            ).clean()
        )
    return items


def _observations_from_text(html: str, source: Source) -> list[dict[str, Any]]:
    """config.text_regex: one observation for fixed_code from a rate stated in prose ("The current GST rate is 9%")."""
    cfg = source.config or {}
    rx = re.compile(str(cfg["text_regex"]), re.I | re.S)
    text = " ".join(HTMLParser(html).text(separator=" ", strip=True).split())
    m = rx.search(text) or rx.search(html)
    if not m:
        raise ValueError("rates_table: text_regex matched nothing — page wording may have changed")
    val = parse_first_number(m.group(1))
    if val is None or val > MAX_RATE_PERCENT:
        raise ValueError(f"rates_table: text_regex captured {m.group(1)!r}, not a rate")
    return [
        {
            "code": str(cfg["fixed_code"]),
            "tax_type": str(cfg["tax_type"]),
            "rate_kind": str(cfg.get("rate_kind") or "standard"),
            "value": val,
            "value_field": "rate",
            "label": "",
            "raw": " ".join(m.group(0).split())[:200],
            "observed_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }
    ]


def parse_rates_document(
    content: bytes | str, source: Source, is_json: bool | None = None
) -> tuple[list[RawItem], list[str]]:
    """Parse an HTML table or JSON document into observation items (used by the adapter and by tests)."""
    cfg = source.config or {}
    if is_json is None:
        is_json = str(cfg.get("format") or "").lower() == "json"
    if cfg.get("text_regex"):
        html = content if isinstance(content, str) else content.decode("utf-8", "replace")
        return observations_to_items(_observations_from_text(html, source), source), []
    if is_json:
        import json

        payload = json.loads(content if isinstance(content, str) else content.decode("utf-8", "replace"))
        headers, rows = _rows_from_json(payload, cfg)
    else:
        html = content if isinstance(content, str) else content.decode("utf-8", "replace")
        headers, rows = _rows_from_html(html, cfg)
    obs, notes = extract_observations(rows, headers, source)
    if not obs:
        raise ValueError("rates_table: 0 observations — selectors/columns may be stale")
    return observations_to_items(obs, source), notes


class RatesTableAdapter(BaseAdapter):
    name = "rates_table"

    def fetch(self, source: Source, http_client: httpx.Client) -> FetchResult:
        cfg = source.config or {}
        resp = self._get(source, http_client, headers=cfg.get("headers") or {})
        etag, last_modified = self._validation_headers(resp)
        if resp.status_code == 304:
            return FetchResult(
                items=[], http_status=304, etag=source.etag, last_modified=source.last_modified, unchanged=True
            )
        resp.raise_for_status()
        if cfg.get("encoding"):
            resp.encoding = cfg["encoding"]
        is_json = str(cfg.get("format") or "").lower() == "json" or "json" in (resp.headers.get("Content-Type") or "")
        items, notes = parse_rates_document(resp.text, source, is_json=is_json)
        return FetchResult(
            items=items, http_status=resp.status_code, etag=etag, last_modified=last_modified, notes=notes
        )


__all__ = [
    "RatesTableAdapter",
    "extract_observations",
    "name_map",
    "normalise_name",
    "parse_amount",
    "parse_first_number",
    "parse_number",
    "parse_rates_document",
    "parse_wht",
    "resolve_code",
]

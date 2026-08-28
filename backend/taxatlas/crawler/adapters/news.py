"""News-search adapter: one query, several interchangeable search providers.

Why this exists: ~100 registry rows are "backstops" — keyword searches over aggregated press for jurisdictions whose
official site is bot-blocked, script-rendered or unreachable. They were Google News RSS URLs, which answer from a laptop
but return HTTP 503 to every request from Google Cloud egress (our Cloud Run jobs). This adapter keeps the *query* as
the source's identity and tries providers in order until one yields at least one item:

  1. ``gdelt``   GDELT DOC 2.0 API (api.gdeltproject.org) — free, open, answers from datacenter IPs; 5 s/host politeness.
  2. ``bing``    Bing News RSS (www.bing.com/news/search?format=rss) — sorted by date; thin (3-12 items) but recent.
  3. ``google``  Google News RSS (news.google.com/rss/search) — richest, but blocked from GCP; last.

Source shape::

    "url": "news://mc-gnews-fiscalite",           # synthetic, stable; Regulation rows key on *item* URLs, not this
    "adapter": "news",
    "config": {
        "query": 'Monaco (impôt OR fiscal OR TVA OR "Services Fiscaux")',   # Google-style: quotes, OR, (), -term
        "lang": "fr",                   # BCP-47; "es-419" / "pt-BR" / "zh-CN" accepted
        "country": "MC",                # ISO alpha-2 of the press market to search (GDELT sourcecountry, Bing cc)
        "google_country": "FR",         # optional: Google News edition when the country has none of its own
        "providers": ["gdelt", "bing"], # optional; default = ("bing", "gdelt", "google")
        "max_items": 40,
        "tax_filter": True, "include_keywords": [...]   # applied exactly as for the rss adapter
    }

Each provider failure (HTTP error, consent page, unparseable feed, GDELT query rejection, zero items) is a *note*, not
an error; when every provider fails the fetch raises one ValueError naming each provider's status. The fetched URL and
the winning provider are written to FetchResult.notes, which the runner copies into CrawlRun.log.
"""

from __future__ import annotations

import base64
import binascii
import re
import threading
import time
from typing import Any
from urllib.parse import parse_qs, quote, quote_plus, urlsplit

import httpx

from taxatlas.crawler.adapters.base import (
    MAX_RESPONSE_BYTES,
    BaseAdapter,
    FetchResult,
    RawItem,
    filter_keywords,
    log,
    max_items,
)
from taxatlas.crawler.adapters.news_codes import gdelt_country, gdelt_language
from taxatlas.crawler.adapters.rss import parse_feed_bytes
from taxatlas.models import Source

PROVIDERS: tuple[str, ...] = ("gdelt", "bing", "google")
# Default order puts Bing first: from Google Cloud egress Bing answers in <1s with items, while GDELT's
# process-wide 5s pacing plus its frequent 0-item answers cost ~20s per source and pushed the production
# crawl past its task timeout. GDELT stays second (better long-tail country coverage), Google last (503 from GCP).
DEFAULT_PROVIDERS: tuple[str, ...] = ("bing", "gdelt", "google")

GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc"
GDELT_TIMESPAN = "7d"
GDELT_MIN_TERM_CHARS = (
    3  # GDELT rejects very short bare terms ("The query you entered included a term that was too short")
)
GDELT_POLITENESS_SECONDS = 5.0  # GDELT's published limit: one request every 5 seconds per client
GDELT_RETRY_SECONDS = 10.0  # one retry after a 429 / timeout (the limit is per IP, so NAT neighbours can trip it)
GDELT_TIMEOUT_SECONDS = 30.0  # api.gdeltproject.org TLS handshakes alone took 14-20 s under load on 2026-08-25
BING_ENDPOINT = "https://www.bing.com/news/search"
GOOGLE_ENDPOINT = "https://news.google.com/rss/search"

_gdelt_last_hit = 0.0
_gdelt_lock = threading.Lock()


class ProviderFailure(Exception):
    """One provider could not answer; the adapter records it and tries the next one."""


class AllProvidersFailed(ValueError):
    """Every provider failed. `notes` carries the per-provider URLs/statuses so the runner can log them."""

    def __init__(self, statuses: list[str], notes: list[str]) -> None:
        super().__init__("all news providers failed — " + "; ".join(statuses))
        self.notes = list(notes)


# ------------------------------------------------------------------------------------------------
# Query translation (Google-style -> GDELT)
# ------------------------------------------------------------------------------------------------
_TOKEN_RE = re.compile(r'-?"[^"]*"|\(|\)|[^\s()"]+')


def _tokens(query: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall(query or "") if t.strip()]


def _parse_group(tokens: list[str], i: int) -> tuple[list[list[str]], int]:
    """Parse tokens from i until ')' / end into AND-ed clauses, each clause a list of OR-ed terms. Returns (clauses, next)."""
    clauses: list[list[str]] = []
    pending_or = False
    while i < len(tokens):
        t = tokens[i]
        if t == ")":
            return clauses, i + 1
        if t.upper() == "OR":
            pending_or = True
            i += 1
            continue
        if t == "(":
            inner, i = _parse_group(tokens, i + 1)
            rendered = _render(inner)
            term = f"({rendered})" if rendered and len(inner) > 1 else rendered
        else:
            term = t
            i += 1
        if not term:
            pending_or = False
            continue
        if pending_or and clauses:
            clauses[-1].append(term)
        else:
            clauses.append([term])
        pending_or = False
    return clauses, i


def _render(clauses: list[list[str]]) -> str:
    parts: list[str] = []
    for clause in clauses:
        if len(clause) == 1:
            parts.append(clause[0])
        else:
            parts.append("(" + " OR ".join(clause) + ")")
    return " ".join(parts)


def _term_ok_for_gdelt(term: str) -> bool:
    body = term[1:] if term.startswith("-") else term
    if body.startswith("(") or body.startswith('"'):
        return True
    if not body.isascii():  # CJK / Arabic / Cyrillic words are short in characters; GDELT's limit is for Latin tokens
        return True
    return len(body) >= GDELT_MIN_TERM_CHARS


def build_gdelt_query(query: str, country: str | None, lang: str | None) -> tuple[str, list[str]]:
    """Translate a Google-News-style query into GDELT DOC syntax and append the source filters.

    GDELT: phrases in quotes, OR only inside parentheses, ``-term`` excludes, bare terms must be >= 3 chars and at least
    one positive term is required. Returns (query, notes) — notes explain dropped terms or missing filters.
    """
    notes: list[str] = []
    clauses, _ = _parse_group(_tokens(query), 0)
    kept: list[list[str]] = []
    dropped: list[str] = []
    for clause in clauses:
        ok = [t for t in clause if _term_ok_for_gdelt(t)]
        dropped += [t for t in clause if t not in ok]
        if ok:
            kept.append(ok)
    if dropped:
        notes.append(f"gdelt: dropped short term(s) {', '.join(dropped)} (GDELT needs >= {GDELT_MIN_TERM_CHARS} chars)")
    positive = [t for c in kept for t in c if not t.startswith("-")]
    if not positive:
        raise ProviderFailure("query has no searchable term for GDELT")
    q = _render(kept)
    fips = gdelt_country(country)
    if fips:
        q += f" sourcecountry:{fips}"
    elif country:
        notes.append(f"gdelt: no FIPS code for country {country!r}; searching without sourcecountry")
    gl = gdelt_language(lang)
    if gl:
        q += f" sourcelang:{gl}"
    elif lang:
        notes.append(f"gdelt: GDELT has no language filter for {lang!r}; searching without sourcelang")
    return q, notes


# ------------------------------------------------------------------------------------------------
# Provider URLs
# ------------------------------------------------------------------------------------------------
def gdelt_url(query: str, country: str | None, lang: str | None, limit: int) -> tuple[str, list[str]]:
    q, notes = build_gdelt_query(query, country, lang)
    url = (
        f"{GDELT_ENDPOINT}?query={quote(q, safe='')}&mode=artlist&format=rss"
        f"&timespan={GDELT_TIMESPAN}&maxrecords={max(1, min(limit, 250))}"
    )
    return url, notes


_BING_SETLANG = {"zh-cn": "zh-hans", "zh-tw": "zh-hant", "zh-hk": "zh-hant"}
_BING_NO_CC = {"CN"}  # cc=CN geo-redirects to cn.bing.com, which serves HTML instead of the RSS


def bing_url(query: str, lang: str | None, country: str | None) -> str:
    params = [("q", query), ("format", "rss"), ("qft", 'sortbydate="1"')]
    setlang = _BING_SETLANG.get((lang or "").lower(), (lang or "").split("-")[0].lower())
    if setlang:
        params.append(("setlang", setlang))
    if country and country.upper() not in _BING_NO_CC:
        params.append(("cc", country.upper()))
    return BING_ENDPOINT + "?" + "&".join(f"{k}={quote_plus(v)}" for k, v in params)


_GOOGLE_CEID_LANG = {"es-419": "es-419", "pt-br": "pt-BR", "pt-pt": "pt-150", "zh-cn": "zh-Hans", "zh-tw": "zh-Hant"}


def google_url(query: str, lang: str | None, country: str | None) -> str:
    """Google News RSS search URL; `ceid` is <edition country>:<edition language> in Google's own spelling."""
    hl = lang or "en"
    gl = (country or "US").upper()
    ceid_lang = _GOOGLE_CEID_LANG.get(hl.lower(), hl.split("-")[0])
    return f"{GOOGLE_ENDPOINT}?q={quote_plus(query)}&hl={hl}&gl={gl}&ceid={gl}:{ceid_lang}"


# ------------------------------------------------------------------------------------------------
# Link unwrapping
# ------------------------------------------------------------------------------------------------
_URL_IN_BYTES = re.compile(rb"https?://[\x21-\x7e]+")


def unwrap_link(url: str) -> str:
    """Return the publisher URL behind a Bing `apiclick.aspx?url=` or (older-format) Google `rss/articles/<b64>` link.

    Google's current article ids (`CBMi...AU_yqL...`) are opaque server-side tokens; those are returned unchanged.
    """
    if not url:
        return url
    parts = urlsplit(url)
    host = parts.netloc.lower()
    if host.endswith("bing.com") and "apiclick" in parts.path:
        target = parse_qs(parts.query).get("url", [""])[0]
        if target.startswith(("http://", "https://")):
            return target
        return url
    if host.endswith("news.google.com") and "/articles/" in parts.path:
        token = parts.path.rsplit("/articles/", 1)[-1].split("/")[0]
        try:
            raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        except (binascii.Error, ValueError):
            return url
        m = _URL_IN_BYTES.search(raw)
        if m:
            candidate = m.group(0).decode("ascii", "ignore").rstrip("\x01\x02\x03\x04\x05\x06\x07\x08")
            # the protobuf string is followed by a field tag byte; trim trailing control/odd bytes
            candidate = re.sub(r"[^\x21-\x7e]+$", "", candidate)
            if candidate.startswith(("http://", "https://")) and "." in candidate[8:]:
                return candidate
    return url


def _looks_like_feed(content: bytes) -> bool:
    head = content[:512].lstrip().lower()
    return head.startswith(b"<?xml") or head.startswith(b"<rss") or head.startswith(b"<feed")


def parse_provider_feed(content: bytes, source: Source, provider: str) -> list[RawItem]:
    """Parse an RSS payload from any provider into RawItems with unwrapped publisher links."""
    if not _looks_like_feed(content):
        snippet = content[:160].decode("utf-8", "replace").strip().replace("\n", " ")
        raise ProviderFailure(f"not a feed ({snippet[:120] or 'empty body'})")
    items = parse_feed_bytes(content, source)
    out: list[RawItem] = []
    for it in items:
        it.url = unwrap_link(it.url)
        it.extra["provider"] = provider
        if provider == "google" and it.summary:
            # Google's description is the title wrapped in a link plus the outlet name ("<title>  <source>"), while the
            # title itself ends in " - <source>": nothing the classifier does not already see.
            flat = " ".join(it.summary.split())
            if flat in (it.title, it.title.replace(" - ", " ")):
                it.summary = None
        out.append(it)
    return out


# ------------------------------------------------------------------------------------------------
# Adapter
# ------------------------------------------------------------------------------------------------
def _gdelt_polite() -> None:
    global _gdelt_last_hit
    with _gdelt_lock:
        wait = GDELT_POLITENESS_SECONDS - (time.monotonic() - _gdelt_last_hit)
        if wait > 0:
            time.sleep(wait)
        _gdelt_last_hit = time.monotonic()


def providers_for(source: Source) -> list[str]:
    cfg = source.config or {}
    raw = cfg.get("providers") or list(DEFAULT_PROVIDERS)
    if isinstance(raw, str):
        raw = [p.strip() for p in raw.split(",")]
    providers = [str(p).lower() for p in raw if str(p).strip()]
    unknown = [p for p in providers if p not in PROVIDERS]
    if unknown:
        raise ValueError(f"news adapter: unknown provider(s) {unknown} (known: {list(PROVIDERS)})")
    if not providers:
        raise ValueError("news adapter: config.providers is empty")
    return providers


class NewsAdapter(BaseAdapter):
    name = "news"

    def fetch(self, source: Source, http_client: httpx.Client) -> FetchResult:
        cfg = source.config or {}
        query = str(cfg.get("query") or "").strip()
        if not query:
            raise ValueError("news adapter requires config.query")
        lang = str(cfg.get("lang") or "").strip() or None
        country = str(cfg.get("country") or "").strip() or None
        google_country = str(cfg.get("google_country") or "").strip() or country
        limit = max_items(source)
        notes: list[str] = []
        statuses: list[str] = []
        for provider in providers_for(source):
            try:
                if provider == "gdelt":
                    url, qnotes = gdelt_url(query, country, lang, limit)
                    notes += qnotes
                elif provider == "bing":
                    url = bing_url(query, lang, country)
                else:
                    url = google_url(query, lang, google_country)
                notes.append(f"{provider}: GET {url}")
                resp = self._fetch_provider(provider, http_client, url, headers=cfg.get("headers") or {}, notes=notes)
                items = parse_provider_feed(resp.content, source, provider)
                if provider == "gdelt" and not items and country and gdelt_country(country):
                    # Outlets of small countries are thin in GDELT; widen to the language only (the keyword filter and the
                    # runner's tax gate still apply) rather than hand the slot to the next provider straight away.
                    url, _ = gdelt_url(query, None, lang, limit)
                    notes.append(f"gdelt: 0 items with sourcecountry:{gdelt_country(country)}; retrying GET {url}")
                    resp = self._fetch_provider(
                        provider, http_client, url, headers=cfg.get("headers") or {}, notes=notes
                    )
                    items = parse_provider_feed(resp.content, source, provider)
                kept = filter_keywords(items, source)
                if not kept:
                    raise ProviderFailure(
                        f"HTTP {resp.status_code}, {len(items)} items, 0 after include/exclude keywords"
                        if items
                        else f"HTTP {resp.status_code}, 0 items"
                    )
                notes.append(f"{provider}: HTTP {resp.status_code}, {len(items)} items, {len(kept)} after keywords")
                notes.append(f"provider={provider}")
                return FetchResult(items=kept[:limit], http_status=resp.status_code, notes=notes)
            except (ProviderFailure, httpx.HTTPError, ValueError) as exc:
                status = _describe(exc)
                statuses.append(f"{provider}: {status}")
                notes.append(f"{provider} failed: {status}")
                log.info("news source %s provider %s failed: %s", source.slug, provider, status)
        raise AllProvidersFailed(statuses, notes)

    def _fetch_provider(
        self, provider: str, http_client: httpx.Client, url: str, headers: dict, notes: list[str]
    ) -> httpx.Response:
        if provider == "gdelt":
            _gdelt_polite()
        else:
            from taxatlas.crawler.adapters.base import polite_delay

            polite_delay(url)
        # No conditional headers: an ETag from one provider means nothing to another.
        kw: dict[str, Any] = {"headers": headers or None}
        if provider == "gdelt":
            kw["timeout"] = httpx.Timeout(GDELT_TIMEOUT_SECONDS)
        try:
            resp = http_client.get(url, **kw)
        except httpx.TimeoutException as exc:
            if provider != "gdelt":
                raise
            notes.append(f"gdelt: {type(exc).__name__}; retrying once after {GDELT_RETRY_SECONDS:g} s")
            time.sleep(GDELT_RETRY_SECONDS)
            resp = http_client.get(url, **kw)
        if provider == "gdelt" and resp.status_code == 429:
            notes.append(f"gdelt: HTTP 429 (rate limited); retrying once after {GDELT_RETRY_SECONDS:g} s")
            time.sleep(GDELT_RETRY_SECONDS)
            resp = http_client.get(url, **kw)
        log.debug("GET %s -> %s", url, resp.status_code)
        if len(resp.content) > MAX_RESPONSE_BYTES:
            raise ProviderFailure(f"response too large (> {MAX_RESPONSE_BYTES // 1_000_000} MB)")
        if resp.status_code >= 400:
            raise ProviderFailure(f"HTTP {resp.status_code}")
        final_host = urlsplit(str(resp.url)).netloc.lower()
        if provider == "bing" and ("consent" in str(resp.url).lower() or not final_host.endswith("bing.com")):
            raise ProviderFailure(f"redirected to {resp.url}")
        if provider == "google" and ("consent" in str(resp.url).lower() or "consent.google" in final_host):
            raise ProviderFailure(f"consent redirect to {resp.url}")
        ctype = resp.headers.get("content-type", "").lower()
        if "html" in ctype and not _looks_like_feed(resp.content):
            raise ProviderFailure(f"HTTP {resp.status_code} returned {ctype.split(';')[0]} instead of a feed")
        return resp


def _describe(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code}"
    if isinstance(exc, httpx.HTTPError):
        return f"{type(exc).__name__}: {exc}"[:160] or type(exc).__name__
    return str(exc)[:200] or type(exc).__name__


def parse_google_news_url(url: str) -> dict[str, Any] | None:
    """Split a Google News RSS search URL into {query, lang, country}; None when `url` is not one."""
    parts = urlsplit(url or "")
    if not parts.netloc.lower().endswith("news.google.com") or not parts.path.startswith("/rss/search"):
        return None
    qs = parse_qs(parts.query)
    query = (qs.get("q") or [""])[0].strip()
    if not query:
        return None
    hl = (qs.get("hl") or [""])[0].strip()
    gl = (qs.get("gl") or [""])[0].strip().upper()
    ceid = (qs.get("ceid") or [""])[0].strip()
    if not gl and ":" in ceid:
        gl = ceid.split(":")[0].upper()
    return {"query": query, "lang": hl or None, "country": gl or None}


__all__ = [
    "DEFAULT_PROVIDERS",
    "AllProvidersFailed",
    "PROVIDERS",
    "NewsAdapter",
    "ProviderFailure",
    "bing_url",
    "build_gdelt_query",
    "gdelt_url",
    "google_url",
    "parse_google_news_url",
    "parse_provider_feed",
    "providers_for",
    "unwrap_link",
]

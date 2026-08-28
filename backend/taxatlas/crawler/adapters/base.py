"""Adapter contract: turn a Source into a list of normalized RawItems.

Every adapter is synchronous (the scheduler runs them in a thread pool) and must never
mutate the Source row — the runner owns persistence. Adapters raise on hard failures
(network error, unparseable payload); the runner converts exceptions into a failed CrawlRun.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit

import httpx

from taxatlas.core.config import get_settings

if TYPE_CHECKING:
    from taxatlas.models import Source

log = logging.getLogger("taxatlas.crawler")

DEFAULT_MAX_ITEMS = 50
MAX_RESPONSE_BYTES = 8_000_000  # refuse to parse bodies above 8 MB (runaway pages, binary blobs)
POLITENESS_DELAY_SECONDS = 0.5
MAX_FUTURE_DAYS = 30  # a "published" date further ahead than this is a misparse (2-digit years, day/month swaps)
MAX_TITLE_CHARS = 500
MAX_SUMMARY_CHARS = 4000


def truncate_words(text: str, limit: int) -> str:
    """Cut `text` to at most `limit` characters on a word boundary, appending an ellipsis when cut."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut[limit // 2 :]:
        cut = cut[: cut.rfind(" ")]
    return cut.rstrip(" ,;:-") + "…"


_last_hit: dict[str, float] = {}
_last_hit_lock = threading.Lock()


@dataclass(slots=True)
class RawItem:
    """One upstream item before classification/persistence."""

    url: str
    title: str
    summary: str | None = None
    published: date | None = None
    body_text: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def clean(self) -> RawItem:
        self.url = (self.url or "").strip()
        self.title = truncate_words(" ".join((self.title or "").split()), MAX_TITLE_CHARS)
        if self.summary:
            self.summary = truncate_words(" ".join(self.summary.split()), MAX_SUMMARY_CHARS) or None
        if isinstance(self.published, datetime):
            self.published = self.published.date()
        if self.published is not None and (self.published - date.today()).days > MAX_FUTURE_DAYS:
            self.extra["rejected_published"] = self.published.isoformat()
            self.published = None
        return self


@dataclass(slots=True)
class FetchResult:
    items: list[RawItem]
    http_status: int | None = None
    etag: str | None = None
    last_modified: str | None = None
    unchanged: bool = False  # HTTP 304 or identical payload — nothing to process
    notes: list[str] = field(default_factory=list)


def polite_delay(url: str) -> None:
    """Ensure at least POLITENESS_DELAY_SECONDS between requests to the same host (process-wide)."""
    host = urlsplit(url).netloc.lower()
    if not host:
        return
    with _last_hit_lock:
        now = time.monotonic()
        wait = POLITENESS_DELAY_SECONDS - (now - _last_hit.get(host, 0.0))
        if wait > 0:
            time.sleep(wait)
        _last_hit[host] = time.monotonic()


def make_http_client() -> httpx.Client:
    settings = get_settings()
    return httpx.Client(
        headers={
            "User-Agent": settings.crawler_user_agent,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, application/json, text/html;q=0.9, */*;q=0.8",
            "Accept-Language": "en;q=0.9, *;q=0.5",
        },
        timeout=httpx.Timeout(settings.crawler_timeout_seconds),
        follow_redirects=True,
    )


def conditional_headers(source: Source) -> dict[str, str]:
    headers: dict[str, str] = {}
    if source.etag:
        headers["If-None-Match"] = source.etag
    if source.last_modified:
        headers["If-Modified-Since"] = source.last_modified
    return headers


def max_items(source: Source) -> int:
    cfg = source.config or {}
    try:
        n = int(cfg.get("max_items", DEFAULT_MAX_ITEMS))
    except (TypeError, ValueError):
        n = DEFAULT_MAX_ITEMS
    return max(1, min(n, 500))


def filter_keywords(items: list[RawItem], source: Source) -> list[RawItem]:
    """Apply optional config['include_keywords'] / config['exclude_keywords'] (case-insensitive substrings)."""
    cfg = source.config or {}
    include = [k.lower() for k in cfg.get("include_keywords", []) or []]
    exclude = [k.lower() for k in cfg.get("exclude_keywords", []) or []]
    if not include and not exclude:
        return items
    kept: list[RawItem] = []
    for it in items:
        text = f"{it.title} {it.summary or ''}".lower()
        if include and not any(k in text for k in include):
            continue
        if exclude and any(k in text for k in exclude):
            continue
        kept.append(it)
    return kept


class BaseAdapter:
    """Subclasses implement `fetch`. `name` must match AdapterType values."""

    name: str = "base"

    def fetch(self, source: Source, http_client: httpx.Client) -> FetchResult:  # pragma: no cover - interface
        raise NotImplementedError

    # helpers shared by network adapters -------------------------------------------------
    def _get(self, source: Source, http_client: httpx.Client, url: str | None = None, **kw: Any) -> httpx.Response:
        url = url or source.url
        polite_delay(url)
        headers = conditional_headers(source)
        headers.update(kw.pop("headers", {}) or {})
        resp = http_client.get(url, headers=headers, **kw)
        log.debug("GET %s -> %s", url, resp.status_code)
        declared = resp.headers.get("Content-Length")
        if (declared and declared.isdigit() and int(declared) > MAX_RESPONSE_BYTES) or len(
            resp.content
        ) > MAX_RESPONSE_BYTES:
            raise ValueError(f"response too large (> {MAX_RESPONSE_BYTES // 1_000_000} MB): {url}")
        return resp

    @staticmethod
    def _validation_headers(resp: httpx.Response) -> tuple[str | None, str | None]:
        return resp.headers.get("ETag"), resp.headers.get("Last-Modified")

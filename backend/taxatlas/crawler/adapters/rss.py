"""RSS / Atom adapter built on feedparser with conditional-GET support."""

from __future__ import annotations

from urllib.parse import urljoin

import httpx

from taxatlas.crawler.adapters.base import BaseAdapter, FetchResult, RawItem, filter_keywords, max_items
from taxatlas.crawler.adapters.dates import parse_date
from taxatlas.models import Source


def _strip_html(text: str | None) -> str | None:
    if not text:
        return None
    from selectolax.parser import HTMLParser

    try:
        return HTMLParser(text).text(separator=" ", strip=True)
    except Exception:
        return text


def parse_feed_bytes(content: bytes, source: Source) -> list[RawItem]:
    import feedparser

    parsed = feedparser.parse(content)
    if parsed.get("bozo") and not parsed.entries:
        exc = parsed.get("bozo_exception")
        raise ValueError(f"feed unparseable: {exc}")
    items: list[RawItem] = []
    for e in parsed.entries[: max_items(source)]:
        link = e.get("link") or ""
        if not link and e.get("links"):
            link = next((lk.get("href") for lk in e["links"] if lk.get("href")), "")
        if not link:
            link = e.get("id") or ""
        title = e.get("title") or ""
        if not link or not title:
            continue
        if source.url and "://" not in link:  # some feeds carry relative links
            link = urljoin(source.url, link)
        summary = e.get("summary") or ""
        if not summary and e.get("content"):
            summary = e["content"][0].get("value", "")
        published = None
        # Prefer the raw string: feedparser's *_parsed tuples are normalised to UTC, which moves an evening
        # "21 Aug 2026 20:30 -0400" to 22 Aug. The publisher's own calendar date is what readers expect.
        for key in ("published", "updated", "created", "dc_date"):
            if e.get(key):
                published = parse_date(e[key])
                if published:
                    break
        if not published:
            for key in ("published_parsed", "updated_parsed", "created_parsed"):
                if e.get(key):
                    published = parse_date(e[key])
                    if published:
                        break
        tags = [t.get("term") for t in e.get("tags", []) if t.get("term")]
        items.append(
            RawItem(
                url=link,
                title=_strip_html(title) or title,
                summary=_strip_html(summary),
                published=published,
                extra={"tags": tags, "author": e.get("author"), "guid": e.get("id")},
            ).clean()
        )
    return items


class RssAdapter(BaseAdapter):
    name = "rss"

    def fetch(self, source: Source, http_client: httpx.Client) -> FetchResult:
        resp = self._get(source, http_client)
        etag, last_modified = self._validation_headers(resp)
        if resp.status_code == 304:
            return FetchResult(
                items=[], http_status=304, etag=source.etag, last_modified=source.last_modified, unchanged=True
            )
        resp.raise_for_status()
        items = filter_keywords(parse_feed_bytes(resp.content, source), source)
        return FetchResult(items=items, http_status=resp.status_code, etag=etag, last_modified=last_modified)

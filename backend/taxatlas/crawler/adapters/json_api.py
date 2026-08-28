"""JSON API adapter with dotted-path extraction.

config keys:
  items_path    dotted path to the list of items (e.g. "results" or "data.items"); "" = root list
  title_path    dotted path within an item (default "title")
  url_path      dotted path within an item (default "url" / "html_url")
  date_path     dotted path within an item (default "publication_date")
  summary_path  dotted path within an item (optional)
  extra_paths   {name: path} copied into RawItem.extra (optional)
  base_url      base for resolving relative item URLs, e.g. an API that returns only a slug (optional)
  headers       extra request headers (optional)
Dotted paths support list indexes ("agencies.0.name") and "|" alternatives ("html_url|url").
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urljoin

import httpx

from taxatlas.crawler.adapters.base import BaseAdapter, FetchResult, RawItem, filter_keywords, max_items
from taxatlas.crawler.adapters.dates import parse_date
from taxatlas.models import Source


def dotted_get(obj: Any, path: str | None, default: Any = None) -> Any:
    if path is None:
        return default
    if path == "":
        return obj
    for alt in path.split("|"):
        cur = obj
        ok = True
        for part in alt.strip().split("."):
            if isinstance(cur, dict):
                if part in cur:
                    cur = cur[part]
                else:
                    ok = False
                    break
            elif isinstance(cur, list):
                try:
                    cur = cur[int(part)]
                except (ValueError, IndexError):
                    ok = False
                    break
            else:
                ok = False
                break
        if ok and cur not in (None, ""):
            return cur
    return default


def parse_json_payload(payload: Any, source: Source) -> list[RawItem]:
    cfg = source.config or {}
    base_url = cfg.get("base_url")
    rows = dotted_get(payload, cfg.get("items_path", "results"), default=[])
    if isinstance(rows, dict):
        rows = list(rows.values())
    if not isinstance(rows, list):
        raise ValueError(f"json adapter: items_path {cfg.get('items_path')!r} did not resolve to a list")
    items: list[RawItem] = []
    for row in rows[: max_items(source)]:
        title = dotted_get(row, cfg.get("title_path", "title"))
        url = dotted_get(row, cfg.get("url_path", "html_url|url|link"))
        if not title or not url:
            continue
        url = str(url)
        if base_url and "://" not in url:  # e.g. API Platform rows that expose only a slug
            url = urljoin(base_url, url)
        published = parse_date(dotted_get(row, cfg.get("date_path", "publication_date|date|published_at")))
        summary = dotted_get(row, cfg.get("summary_path", "abstract|summary|description"))
        extra: dict[str, Any] = {}
        for name, path in (cfg.get("extra_paths") or {}).items():
            val = dotted_get(row, path)
            if val is not None:
                extra[name] = val
        items.append(
            RawItem(
                url=url,
                title=str(title),
                summary=str(summary) if summary else None,
                published=published,
                extra=extra,
            ).clean()
        )
    return items


class JsonApiAdapter(BaseAdapter):
    name = "json"

    def fetch(self, source: Source, http_client: httpx.Client) -> FetchResult:
        cfg = source.config or {}
        resp = self._get(source, http_client, headers={"Accept": "application/json", **(cfg.get("headers") or {})})
        etag, last_modified = self._validation_headers(resp)
        if resp.status_code == 304:
            return FetchResult(
                items=[], http_status=304, etag=source.etag, last_modified=source.last_modified, unchanged=True
            )
        resp.raise_for_status()
        items = filter_keywords(parse_json_payload(resp.json(), source), source)
        return FetchResult(items=items, http_status=resp.status_code, etag=etag, last_modified=last_modified)

"""HTML listing adapter: CSS selectors from Source.config.

config keys:
  item_selector     CSS for each item container (required). May select the <a> itself.
  title_selector    CSS within item for title (default: first <a>)
  title_attr        read title from this attribute instead of text (optional)
  link_selector     CSS within item for the anchor (default: title element if <a>, else first <a>)
  date_selector     CSS within item for the date text; "self" = the item's own text (optional)
  date_format       strptime format or 'auto' (default)
  date_dayfirst     bool; parse ambiguous dates as D/M/Y (default False)
  summary_selector  CSS within item for a summary/teaser (optional)
  summary_attr      read summary from this attribute (e.g. "title") instead of text (optional)
  extra_selectors   {name: css} copied into RawItem.extra as text (e.g. docket, category)
  base_url          base for resolving relative links (default: source.url)
  encoding          force response encoding (optional)
  headers           extra request headers (e.g. {"Accept": "text/html"})
"""

from __future__ import annotations

from urllib.parse import urljoin

import httpx
from selectolax.parser import HTMLParser, Node

from taxatlas.crawler.adapters.base import BaseAdapter, FetchResult, RawItem, filter_keywords, max_items
from taxatlas.crawler.adapters.dates import date_from_url, parse_date
from taxatlas.models import Source


def _text(node: Node | None) -> str:
    return " ".join(node.text(separator=" ", strip=True).split()) if node is not None else ""


def _first_anchor(node: Node | None) -> Node | None:
    if node is None:
        return None
    if node.tag == "a":
        return node
    return node.css_first("a[href]")


def _select(node: Node, css: str | None) -> Node | None:
    if not css:
        return None
    if css == "self":
        return node
    return node.css_first(css)


def parse_listing(html: str, source: Source) -> list[RawItem]:
    cfg = source.config or {}
    item_sel = cfg.get("item_selector")
    if not item_sel:
        raise ValueError("html adapter requires config.item_selector")
    base_url = cfg.get("base_url") or source.url
    tree = HTMLParser(html)
    items: list[RawItem] = []
    seen: set[str] = set()
    limit = max_items(source)
    for node in tree.css(item_sel):
        title_node = _select(node, cfg.get("title_selector")) if cfg.get("title_selector") else _first_anchor(node)
        if title_node is None:
            continue
        link_node = (
            _select(node, cfg.get("link_selector"))
            if cfg.get("link_selector")
            else (_first_anchor(title_node) or _first_anchor(node))
        )
        href = (link_node.attributes.get("href") if link_node is not None else None) or ""
        href = href.strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:", "data:")):
            continue
        url = urljoin(base_url, href)
        if cfg.get("title_attr"):
            title = title_node.attributes.get(cfg["title_attr"]) or ""
        else:
            title = _text(title_node) or (title_node.attributes.get("title") or "")
        title = " ".join(title.split())
        if not title or url in seen:
            continue
        seen.add(url)
        published = None
        dn = _select(node, cfg.get("date_selector"))
        if dn is not None:
            raw = dn.attributes.get("datetime") or dn.attributes.get("content") or _text(dn)
            published = parse_date(raw, cfg.get("date_format", "auto"), dayfirst=bool(cfg.get("date_dayfirst")))
        if published is None:
            published = date_from_url(url)
        summary = None
        sn = _select(node, cfg.get("summary_selector"))
        if sn is not None:
            summary = sn.attributes.get(cfg["summary_attr"]) if cfg.get("summary_attr") else _text(sn)
        if summary and " ".join(summary.split()) == title:
            summary = None
        extra: dict[str, str] = {}
        for name, css in (cfg.get("extra_selectors") or {}).items():
            en = _select(node, css)
            if en is not None:
                val = _text(en)
                if val:
                    extra[name] = val[:200]
        items.append(RawItem(url=url, title=title, summary=summary or None, published=published, extra=extra).clean())
        if len(items) >= limit:
            break
    return items


class HtmlAdapter(BaseAdapter):
    name = "html"

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
        items = filter_keywords(parse_listing(resp.text, source), source)
        if not items:
            raise ValueError("html adapter matched 0 items — selectors may be stale")
        return FetchResult(items=items, http_status=resp.status_code, etag=etag, last_modified=last_modified)

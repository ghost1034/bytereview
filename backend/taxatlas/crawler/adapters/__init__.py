"""Adapter registry."""

from __future__ import annotations

from taxatlas.crawler.adapters.base import BaseAdapter, FetchResult, RawItem, make_http_client
from taxatlas.crawler.adapters.browser import BrowserAdapter
from taxatlas.crawler.adapters.fixture import FixtureAdapter
from taxatlas.crawler.adapters.html import HtmlAdapter
from taxatlas.crawler.adapters.json_api import JsonApiAdapter
from taxatlas.crawler.adapters.news import NewsAdapter
from taxatlas.crawler.adapters.rates_table import RatesTableAdapter
from taxatlas.crawler.adapters.rss import RssAdapter

_REGISTRY: dict[str, type[BaseAdapter]] = {
    RssAdapter.name: RssAdapter,
    HtmlAdapter.name: HtmlAdapter,
    JsonApiAdapter.name: JsonApiAdapter,
    FixtureAdapter.name: FixtureAdapter,
    BrowserAdapter.name: BrowserAdapter,
    RatesTableAdapter.name: RatesTableAdapter,
    NewsAdapter.name: NewsAdapter,
}


def get_adapter(source) -> BaseAdapter:
    """Return an adapter instance for `source.adapter` (raises ValueError for unknown adapters)."""
    key = str(getattr(source, "adapter", "") or "").lower()
    try:
        return _REGISTRY[key]()
    except KeyError:
        raise ValueError(f"unknown adapter {key!r} (known: {sorted(_REGISTRY)})") from None


__all__ = ["BaseAdapter", "FetchResult", "RawItem", "get_adapter", "make_http_client"]

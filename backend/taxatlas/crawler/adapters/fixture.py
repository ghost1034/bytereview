"""Offline fixture adapter: reads a local RSS/Atom, HTML, or JSON file.

config keys:
  file   path relative to the backend/ directory (e.g. "fixtures/irs_newsroom.xml")
  kind   "rss" | "html" | "json" (default: inferred from extension)
  ...    plus any html/json selector config needed for parsing

Set env TAXATLAS_FIXTURE_VARIANT=2 to read "<stem>.v2.<ext>" when it exists — a deterministic
second-run variant used to exercise the 'updated' change path in tests and demos.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx

from taxatlas.crawler.adapters.base import BaseAdapter, FetchResult, filter_keywords
from taxatlas.models import Source

BACKEND_DIR = Path(__file__).resolve().parents[2]
FIXTURE_VARIANT_ENV = "TAXATLAS_FIXTURE_VARIANT"


def resolve_fixture_path(source: Source) -> Path:
    cfg = source.config or {}
    rel = cfg.get("file")
    if not rel:
        raise ValueError("fixture adapter requires config.file")
    path = Path(rel)
    if not path.is_absolute():
        path = BACKEND_DIR / path
    variant = os.environ.get(FIXTURE_VARIANT_ENV, "").strip()
    if variant and variant not in ("", "1"):
        alt = path.with_name(f"{path.stem}.v{variant}{path.suffix}")
        if alt.exists():
            return alt
    if not path.exists():
        raise FileNotFoundError(f"fixture file not found: {path}")
    return path


class FixtureAdapter(BaseAdapter):
    name = "fixture"

    def fetch(self, source: Source, http_client: httpx.Client | None = None) -> FetchResult:
        path = resolve_fixture_path(source)
        cfg = source.config or {}
        kind = cfg.get("kind") or {
            ".xml": "rss",
            ".rss": "rss",
            ".atom": "rss",
            ".html": "html",
            ".htm": "html",
            ".json": "json",
        }.get(path.suffix.lower(), "rss")
        data = path.read_bytes()
        if kind == "rss":
            from taxatlas.crawler.adapters.rss import parse_feed_bytes

            items = parse_feed_bytes(data, source)
        elif kind == "html":
            from taxatlas.crawler.adapters.html import parse_listing

            items = parse_listing(data.decode("utf-8", errors="replace"), source)
        elif kind == "json":
            from taxatlas.crawler.adapters.json_api import parse_json_payload

            items = parse_json_payload(json.loads(data.decode("utf-8")), source)
        else:
            raise ValueError(f"fixture adapter: unknown kind {kind!r}")
        return FetchResult(items=filter_keywords(items, source), http_status=200, notes=[f"fixture={path.name}"])

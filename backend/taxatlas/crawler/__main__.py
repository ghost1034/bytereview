"""Crawler CLI.

    python -m taxatlas.crawler run --all [--force-network] [--include-disabled] [--adapter browser|http|rss|html|json|news|fixture]
    python -m taxatlas.crawler run --source <slug> [--force-network]
    python -m taxatlas.crawler list
    python -m taxatlas.crawler check-urls [--slug <slug>] [--timeout 20]
    python -m taxatlas.crawler prune-courts --dry-run|--apply    # drop crawled decisions that are not tax cases; demote landmarks
    python -m taxatlas.crawler prune-tariffs --dry-run|--apply   # drop crawled Tariff rows that are not trade measures
    python -m taxatlas.crawler prune-regulations --dry-run|--apply  # drop crawled news items that fail the tax relevance gate
    python -m taxatlas.crawler reclassify-tariffs     # re-derive tariff metadata after classifier tuning
    python -m taxatlas.crawler reclassify-regulations --dry-run|--apply  # re-run the classifier over crawled regulations
    python -m taxatlas.crawler sync-registry [--force-enabled]  # dev helper: upsert app.seed.sources.SOURCES into the DB
    python -m taxatlas.crawler dispatch-notifications # deliver pending notifications via webhook/email channels
    python -m taxatlas.crawler translate --backfill [--limit N] [--entity regulations|court_decisions|tariffs|sources|jurisdictions|all] [--dry-run]
                                                 # detect language / fill *_en on rows not yet translated (docs/translation.md)

Exit code is non-zero when any run failed (or any URL check returned an error).
"""

from __future__ import annotations

import argparse
import logging
import sys

from sqlalchemy import select


def _fmt(v, width: int) -> str:
    s = "" if v is None else str(v)
    return s[:width].ljust(width)


HTTP_ADAPTERS = ("rss", "html", "json", "news")


def adapter_filter(value: str | None) -> tuple[str, ...] | None:
    """`--adapter` value -> adapter names for run_all (None = every adapter). "http" is the non-browser network set."""
    if not value:
        return None
    if value == "http":
        return HTTP_ADAPTERS
    return (value,)


def browser_session_if_needed(adapters):
    """Open one shared Chromium for the run when browser sources may be crawled and the adapter is enabled here."""
    import contextlib

    from taxatlas.core.config import get_settings

    if not get_settings().browser_enabled or (adapters is not None and "browser" not in adapters):
        return contextlib.nullcontext()
    from taxatlas.crawler.adapters.browser import browser_session

    return browser_session()


def cmd_run(args: argparse.Namespace) -> int:
    from taxatlas.core.db import SessionLocal, init_db
    from taxatlas.crawler.runner import run_all, run_source
    from taxatlas.models import CrawlStatus, Source

    init_db()
    network = True if args.force_network else None
    adapters = adapter_filter(getattr(args, "adapter", None))
    failed = 0
    with SessionLocal() as db, browser_session_if_needed(adapters):
        if args.source:
            src = db.scalar(select(Source).where(Source.slug == args.source))
            if src is None:
                print(f"source not found: {args.source}", file=sys.stderr)
                return 2
            runs = [run_source(db, src, triggered_by="cli", network=network)]
        else:
            runs = run_all(
                db, triggered_by="cli", only_enabled=not args.include_disabled, network=network, adapters=adapters
            )
        print(f"{'source':<34}{'status':<11}{'http':<6}{'found':>6}{'new':>6}{'chg':>6}  error")
        for r in runs:
            slug = r.source.slug if r.source else str(r.source_id)
            print(
                f"{_fmt(slug, 34)}{_fmt(r.status, 11)}{_fmt(r.http_status, 6)}{r.items_found:>6}{r.items_new:>6}{r.items_changed:>6}  {(r.error or '')[:70]}"
            )
            if r.status == CrawlStatus.FAILED:
                failed += 1
        print(f"\n{len(runs)} run(s), {failed} failed")
    return 1 if failed else 0


def cmd_list(_args: argparse.Namespace) -> int:
    from taxatlas.core.db import SessionLocal, init_db
    from taxatlas.models import Source

    init_db()
    with SessionLocal() as db:
        rows = list(db.scalars(select(Source).order_by(Source.category, Source.slug)))
        print(f"{'slug':<34}{'cat':<11}{'adp':<8}{'jur':<7}{'on':<4}{'status':<11}{'fails':>5}{'items':>6}  last_run")
        for s in rows:
            jur = s.jurisdiction.code if s.jurisdiction else ""
            last = s.last_run_at.strftime("%Y-%m-%d %H:%M") if s.last_run_at else ""
            print(
                f"{_fmt(s.slug, 34)}{_fmt(s.category, 11)}{_fmt(s.adapter, 8)}{_fmt(jur, 7)}{_fmt('y' if s.enabled else 'n', 4)}{_fmt(s.last_status, 11)}{s.consecutive_failures or 0:>5}{s.items_total or 0:>6}  {last}"
            )
        print(f"\n{len(rows)} source(s)")
    return 0


def cmd_check_urls(args: argparse.Namespace) -> int:
    """HEAD/GET each registry URL (from the DB if present, else app.seed.sources) and print status."""
    import httpx

    from taxatlas.core.config import get_settings

    settings = get_settings()
    entries: list[tuple[str, str, str]] = []
    try:
        from taxatlas.core.db import SessionLocal
        from taxatlas.models import Source

        with SessionLocal() as db:
            entries = [(s.slug, s.adapter, s.url) for s in db.scalars(select(Source).order_by(Source.slug))]
    except Exception:
        entries = []
    if not entries:
        from taxatlas.seed.sources import SOURCES

        entries = [(s["slug"], s["adapter"], s["url"]) for s in SOURCES]
    if args.slug:
        entries = [e for e in entries if e[0] == args.slug]
    bad = 0
    with httpx.Client(
        headers={"User-Agent": settings.crawler_user_agent}, timeout=args.timeout, follow_redirects=True
    ) as client:
        for slug, adapter, url in entries:
            if adapter == "fixture" or url.startswith("news://"):
                print(f"{_fmt(slug, 34)} {adapter:<8} {url}")
                continue
            try:
                resp = client.head(url)
                if resp.status_code >= 400 or resp.status_code == 405:
                    resp = client.get(url)
                code = resp.status_code
                note = resp.headers.get("content-type", "")[:30]
            except Exception as exc:
                code, note = "ERR", f"{type(exc).__name__}: {str(exc)[:60]}"
            ok = isinstance(code, int) and code < 400
            if not ok:
                bad += 1
            print(f"{_fmt(slug, 34)} {_fmt(code, 4)} {'ok ' if ok else 'BAD'} {note:<32} {url[:90]}")
    print(f"\n{len(entries)} url(s), {bad} bad")
    return 1 if bad else 0


def sync_registry(db, sources: list[dict] | None = None, force_enabled: bool = False) -> dict[str, int]:
    """Upsert SOURCES by slug, creating bare Jurisdiction rows for unknown codes (dev helper).

    The canonical loader is `python -m taxatlas.seed`; this exists so the crawler can be exercised
    against a scratch database without the full reference dataset. `enabled` is runtime state
    (auto-disable, admin toggles) and is only applied on create unless `force_enabled` is set.
    """
    from taxatlas.models import Jurisdiction, JurisdictionLevel, Source

    if sources is None:
        from taxatlas.seed.sources import SOURCES

        sources = SOURCES
    counts = {"created": 0, "updated": 0, "jurisdictions_created": 0}
    for spec in sources:
        spec = dict(spec)
        code = spec.pop("jurisdiction_code", None)
        jur_id = None
        if code:
            jur = db.scalar(select(Jurisdiction).where(Jurisdiction.code == code))
            if jur is None:
                level = (
                    JurisdictionLevel.SUPRANATIONAL
                    if code == "EU"
                    else JurisdictionLevel.STATE
                    if "-" in code
                    else JurisdictionLevel.COUNTRY
                )
                parent = None
                if "-" in code:
                    parent = db.scalar(select(Jurisdiction).where(Jurisdiction.code == code.split("-")[0]))
                    if parent is None:
                        parent = Jurisdiction(
                            code=code.split("-")[0], name=code.split("-")[0], level=JurisdictionLevel.COUNTRY
                        )
                        db.add(parent)
                        db.flush()
                        counts["jurisdictions_created"] += 1
                jur = Jurisdiction(code=code, name=code, level=level, parent_id=parent.id if parent else None)
                db.add(jur)
                db.flush()
                counts["jurisdictions_created"] += 1
            jur_id = jur.id
        spec["jurisdiction_id"] = jur_id
        spec["tax_types"] = [str(t) for t in spec.get("tax_types") or []]
        row = db.scalar(select(Source).where(Source.slug == spec["slug"]))
        if row is None:
            db.add(Source(**spec))
            counts["created"] += 1
        else:
            for k, v in spec.items():
                if k == "enabled" and not force_enabled:
                    continue
                setattr(row, k, v)
            counts["updated"] += 1
    db.commit()
    return counts


def cmd_prune_tariffs(args: argparse.Namespace) -> int:
    from taxatlas.core.db import SessionLocal, init_db
    from taxatlas.crawler.runner import prune_tariffs

    init_db()
    with SessionLocal() as db:
        res = prune_tariffs(db, apply=args.apply)
    mode = "APPLIED" if args.apply else "DRY RUN"
    print(
        f"[{mode}] scanned={res['scanned']} to_delete={res['to_delete']} deleted={res['deleted']} events_deleted={res['events_deleted']}"
    )
    for t in res["titles"]:
        print(f"  - {t[:110]}")
    return 0


def cmd_prune_regulations(args: argparse.Namespace) -> int:
    from taxatlas.core.db import SessionLocal, init_db
    from taxatlas.crawler.runner import prune_regulations

    init_db()
    with SessionLocal() as db:
        res = prune_regulations(db, apply=args.apply)
    mode = "APPLIED" if args.apply else "DRY RUN"
    print(
        f"[{mode}] scanned={res['scanned']} to_delete={res['to_delete']} deleted={res['deleted']} events_deleted={res['events_deleted']}"
    )
    for t in res["titles"]:
        print(f"  - {t[:120]}")
    return 0


def cmd_reclassify_regulations(args: argparse.Namespace) -> int:
    from taxatlas.core.db import SessionLocal, init_db
    from taxatlas.crawler.runner import reclassify_regulations

    init_db()
    with SessionLocal() as db:
        res = reclassify_regulations(db, apply=args.apply)
    mode = "APPLIED" if args.apply else "DRY RUN"
    print(
        f"[{mode}] scanned={res['scanned']} rows_changed={res['rows_changed']} fields_changed={res['fields_changed']}"
    )
    for field, table in res["transitions"].items():
        if table:
            print(f"  {field}:")
            for key, n in table.items():
                print(f"    {n:>4}  {key}")
    return 0


def cmd_prune_courts(args: argparse.Namespace) -> int:
    from taxatlas.core.db import SessionLocal, init_db
    from taxatlas.crawler.runner import prune_courts

    init_db()
    with SessionLocal() as db:
        res = prune_courts(db, apply=args.apply)
    mode = "APPLIED" if args.apply else "DRY RUN"
    print(
        f"[{mode}] scanned={res['scanned']} to_delete={res['to_delete']} deleted={res['deleted']} "
        f"events_deleted={res['events_deleted']} to_downgrade={res['to_downgrade']} downgraded={res['downgraded']}"
    )
    for t in res["titles"]:
        print(f"  - {t[:110]}")
    return 0


def cmd_reclassify_tariffs(_args: argparse.Namespace) -> int:
    from taxatlas.core.db import SessionLocal, init_db
    from taxatlas.crawler.runner import reclassify_tariffs

    init_db()
    with SessionLocal() as db:
        res = reclassify_tariffs(db)
    print(f"reclassified tariffs: {res}")
    return 0


def cmd_sync_registry(args: argparse.Namespace) -> int:
    from taxatlas.core.db import SessionLocal, init_db

    init_db()
    with SessionLocal() as db:
        counts = sync_registry(db, force_enabled=bool(getattr(args, "force_enabled", False)))
    print(f"registry synced: {counts}")
    return 0


def cmd_dispatch_notifications(_args: argparse.Namespace) -> int:
    """Deliver pending watchlist notifications through users' webhook/email channels (one pass)."""
    from taxatlas.core.db import init_db
    from taxatlas.services.notifications import dispatch_pending

    init_db()
    stats = dispatch_pending()
    print(
        f"channels={stats['channels']} sent={stats['sent']} failed={stats['failed']} dead={stats['dead']} "
        f"skipped={stats['skipped']} deferred={stats['deferred']} auto_disabled={stats['auto_disabled']}"
    )
    return 0


# Mirrors app.services.translate.ENTITIES (kept literal so `--help` needs no DB/engine import; tests assert parity).
TRANSLATE_ENTITIES = ("regulations", "court_decisions", "tariffs", "sources", "jurisdictions")


def cmd_translate(args: argparse.Namespace) -> int:
    """Backfill language detection / English translations (docs/translation.md). Idempotent; safe to re-run."""
    import json

    from taxatlas.core.db import SessionLocal, init_db
    from taxatlas.services import translate

    init_db()
    service = translate.get_service()
    if not service.enabled and not args.dry_run:
        print(
            f"TRANSLATE_PROVIDER={service.provider}: detection only, *_en columns will stay empty "
            "(set TRANSLATE_PROVIDER=google to translate)",
            file=sys.stderr,
        )
    with SessionLocal() as db:
        used_before = service.budget_used_today(db) if service.enabled else 0
        res = translate.backfill(
            db, service, entity=args.entity, limit=args.limit, dry_run=args.dry_run, batch_size=args.batch_size
        )
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(f"[{mode}] provider={res['provider']}")
    print(f"{'entity':<18}{'scanned':>8}{'english':>8}{'transl':>8}{'detect':>8}{'events':>8}  stopped")
    for name, rep in res["entities"].items():
        print(
            f"{name:<18}{rep['scanned']:>8}{rep['english']:>8}{rep['translated']:>8}{rep['detected_only']:>8}"
            f"{rep['change_events']:>8}  {'yes' if rep['stopped'] else ''}"
        )
    st = res["stats"]
    print(
        f"\nprovider_calls={st['provider_calls']} segments={st['segments_sent']} chars={st['chars_sent']} "
        f"cache_hits={st['cache_hits']} failures={st['failures']} budget_stops={st['budget_stops']} "
        f"budget_used_today_before={used_before}"
    )
    print(json.dumps({"job": "translate", **res}, default=str))
    return 1 if st["failures"] and not res["totals"]["translated"] else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m taxatlas.crawler", description="TaxAtlas crawler CLI")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="run one or all sources")
    g = p_run.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--source", metavar="SLUG")
    p_run.add_argument("--force-network", action="store_true", help="override CRAWLER_NETWORK=false")
    p_run.add_argument("--include-disabled", action="store_true")
    p_run.add_argument(
        "--adapter",
        choices=["browser", "http", "rss", "html", "json", "fixture"],
        help="only sources using this adapter ('http' = rss+html+json+news, i.e. everything the browser job does not own)",
    )
    p_run.set_defaults(func=cmd_run)

    p_list = sub.add_parser("list", help="list sources with last status")
    p_list.set_defaults(func=cmd_list)

    p_chk = sub.add_parser("check-urls", help="HEAD/GET each source URL")
    p_chk.add_argument("--slug")
    p_chk.add_argument("--timeout", type=float, default=20.0)
    p_chk.set_defaults(func=cmd_check_urls)

    p_prune = sub.add_parser(
        "prune-tariffs", help="delete crawled Tariff rows that fail the trade-measure relevance gate"
    )
    pg = p_prune.add_mutually_exclusive_group(required=True)
    pg.add_argument("--dry-run", action="store_true")
    pg.add_argument("--apply", action="store_true")
    p_prune.set_defaults(func=cmd_prune_tariffs)

    p_pr = sub.add_parser("prune-regulations", help="delete crawled news items that fail the strict tax relevance gate")
    prg = p_pr.add_mutually_exclusive_group(required=True)
    prg.add_argument("--dry-run", action="store_true")
    prg.add_argument("--apply", action="store_true")
    p_pr.set_defaults(func=cmd_prune_regulations)

    p_rr = sub.add_parser(
        "reclassify-regulations", help="re-run the classifier over crawled regulations (no change events)"
    )
    rrg = p_rr.add_mutually_exclusive_group(required=True)
    rrg.add_argument("--dry-run", action="store_true")
    rrg.add_argument("--apply", action="store_true")
    p_rr.set_defaults(func=cmd_reclassify_regulations)

    p_pc = sub.add_parser(
        "prune-courts", help="delete crawled CourtDecision rows that are not tax cases; demote crawled landmarks"
    )
    pcg = p_pc.add_mutually_exclusive_group(required=True)
    pcg.add_argument("--dry-run", action="store_true")
    pcg.add_argument("--apply", action="store_true")
    p_pc.set_defaults(func=cmd_prune_courts)

    p_recl = sub.add_parser(
        "reclassify-tariffs", help="re-derive status/rate/partner/HS on crawled Tariff rows (no change events)"
    )
    p_recl.set_defaults(func=cmd_reclassify_tariffs)

    p_sync = sub.add_parser("sync-registry", help="dev helper: upsert app.seed.sources.SOURCES into the DB")
    p_sync.add_argument(
        "--force-enabled", action="store_true", help="also apply the registry's enabled flag to existing sources"
    )
    p_sync.set_defaults(func=cmd_sync_registry)

    p_nd = sub.add_parser("dispatch-notifications", help="deliver pending notifications via webhook/email channels")
    p_nd.set_defaults(func=cmd_dispatch_notifications)

    p_tr = sub.add_parser("translate", help="detect language / fill English translations on untranslated rows")
    p_tr.add_argument("--backfill", action="store_true", required=True, help="process rows not yet translated")
    p_tr.add_argument("--limit", type=int, default=None, help="max rows (content) / distinct names per entity")
    p_tr.add_argument("--entity", default="all", choices=["all", *TRANSLATE_ENTITIES])
    p_tr.add_argument(
        "--dry-run", action="store_true", help="count and estimate characters; no provider calls, no writes"
    )
    p_tr.add_argument("--batch-size", type=int, default=100, help="rows per provider round-trip / commit")
    p_tr.set_defaults(func=cmd_translate)

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

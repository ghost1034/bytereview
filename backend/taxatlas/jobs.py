"""One-shot TaxAtlas jobs for local use and Cloud Run Jobs."""

from __future__ import annotations

import argparse
import json
import logging
import time
import zlib
from contextlib import contextmanager, nullcontext
from typing import Any, Iterator

from sqlalchemy import text

from core.database import db_config
from taxatlas.core.config import get_settings
from taxatlas.core.db import SessionLocal
from taxatlas.schedules import JOB_SCHEDULES

log = logging.getLogger("taxatlas.jobs")

ADAPTERS = {schedule.job: schedule.adapters for schedule in JOB_SCHEDULES if schedule.adapters}


def lock_key(name: str) -> int:
    return zlib.crc32(f"cpaautomation:taxatlas:{name}".encode("utf-8")) & 0x7FFFFFFF


@contextmanager
def job_lock(name: str) -> Iterator[bool]:
    if db_config.engine.dialect.name != "postgresql":
        yield True
        return
    with db_config.engine.connect() as connection:
        key = lock_key(name)
        acquired = bool(connection.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": key}).scalar())
        try:
            yield acquired
        finally:
            if acquired:
                connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})


def run_crawl(job: str) -> dict[str, Any]:
    from taxatlas.crawler.runner import run_all
    from taxatlas.models import CrawlStatus
    from taxatlas.services.notifications import dispatch_pending

    adapters = ADAPTERS[job]
    browser = nullcontext()
    if job == "crawl-browser":
        if not get_settings().browser_enabled:
            raise RuntimeError("TAXATLAS_BROWSER_ENABLED=true is required for browser crawls")
        from taxatlas.crawler.adapters.browser import browser_session

        browser = browser_session()
    with SessionLocal() as db, browser:
        runs = run_all(db, triggered_by="job", only_enabled=True, adapters=adapters)
        failed = [run for run in runs if run.status == CrawlStatus.FAILED]
        summary = {
            "runs": len(runs),
            "failed": len(failed),
            "items_found": sum(run.items_found or 0 for run in runs),
            "items_new": sum(run.items_new or 0 for run in runs),
            "items_changed": sum(run.items_changed or 0 for run in runs),
            "failed_sources": [run.source.slug for run in failed if run.source][:50],
        }
    summary["dispatch"] = dispatch_pending()
    if runs and len(failed) == len(runs):
        raise RuntimeError(f"all {len(runs)} sources failed")
    return summary


def run_dispatch() -> dict[str, Any]:
    from taxatlas.services.notifications import dispatch_pending

    return {"dispatch": dispatch_pending()}


def run_translate(args: argparse.Namespace) -> dict[str, Any]:
    from taxatlas.services import translate

    service = translate.get_service()
    with SessionLocal() as db:
        return translate.backfill(
            db,
            service,
            entity=args.entity,
            limit=args.limit,
            dry_run=args.dry_run,
            batch_size=args.batch_size,
        )


def run_seed_job() -> dict[str, Any]:
    from taxatlas.seed.runner import run_seed

    with SessionLocal() as db:
        return run_seed(db)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m taxatlas.jobs")
    parser.add_argument(
        "job",
        choices=[*ADAPTERS, "dispatch", "translate", "seed"],
    )
    parser.add_argument("--limit", type=int)
    parser.add_argument("--entity", default="all")
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    started = time.perf_counter()
    try:
        with job_lock(args.job) as acquired:
            if not acquired:
                result = {"job": args.job, "status": "skipped", "reason": "lock held"}
            elif args.job in ADAPTERS:
                result = {"job": args.job, "status": "success", **run_crawl(args.job)}
            elif args.job == "dispatch":
                result = {"job": args.job, "status": "success", **run_dispatch()}
            elif args.job == "translate":
                result = {"job": args.job, "status": "success", **run_translate(args)}
            else:
                result = {"job": args.job, "status": "success", **run_seed_job()}
        result["duration_seconds"] = round(time.perf_counter() - started, 3)
        print(json.dumps(result, default=str, sort_keys=True))
        return 0
    except Exception as exc:
        log.exception("TaxAtlas job failed")
        print(json.dumps({
            "job": args.job,
            "status": "failed",
            "error": str(exc),
            "duration_seconds": round(time.perf_counter() - started, 3),
        }, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

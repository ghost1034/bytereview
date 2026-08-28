"""Idempotent, auditable TaxAtlas reference-data seeding."""

from __future__ import annotations

import hashlib
import json
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from taxatlas.models import SeedRun
from taxatlas.seed.court_decisions import COURT_DECISIONS
from taxatlas.seed.jurisdictions import JURISDICTIONS
from taxatlas.seed.loader import (
    Counts,
    load_court_decisions,
    load_jurisdictions,
    load_rates,
    load_regulations,
    load_sources,
    load_tariffs,
)
from taxatlas.seed.rates import RATES
from taxatlas.seed.regulations import REGULATIONS
from taxatlas.seed.sources import SOURCES
from taxatlas.seed.tariffs import TARIFFS

SEED_VERSION = os.getenv("TAXATLAS_SEED_VERSION", "2026-08-native-v1")


def seed_checksum() -> str:
    payload = {
        "version": SEED_VERSION,
        "jurisdictions": JURISDICTIONS,
        "rates": RATES,
        "regulations": REGULATIONS,
        "court_decisions": COURT_DECISIONS,
        "tariffs": TARIFFS,
        "sources": SOURCES,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def run_seed(db: Session) -> dict:
    checksum = seed_checksum()
    prior = db.scalar(select(SeedRun).where(SeedRun.checksum == checksum))
    if prior is not None:
        return {
            "version": prior.version,
            "checksum": prior.checksum,
            "already_applied": True,
            "counts": prior.summary or {},
        }

    counts = Counts()
    try:
        jurisdiction_ids = load_jurisdictions(db, JURISDICTIONS, counts)
        load_rates(db, RATES, jurisdiction_ids, counts)
        load_regulations(db, REGULATIONS, jurisdiction_ids, counts)
        load_court_decisions(db, COURT_DECISIONS, jurisdiction_ids, counts)
        load_tariffs(db, TARIFFS, jurisdiction_ids, counts)
        load_sources(db, SOURCES, jurisdiction_ids, counts)
        db.add(
            SeedRun(
                version=SEED_VERSION,
                checksum=checksum,
                summary=dict(counts),
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "version": SEED_VERSION,
        "checksum": checksum,
        "already_applied": False,
        "counts": dict(counts),
    }


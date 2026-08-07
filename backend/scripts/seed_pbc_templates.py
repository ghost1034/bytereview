#!/usr/bin/env python3
"""Seed the canonical PBC template library for every firm.

The command is a dry run unless ``--apply`` is supplied. It is safe to rerun:
missing canonical templates are inserted, the exact legacy six-item audit
starter is expanded, and all other existing templates are preserved.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path

from sqlalchemy import func

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from core.database import db_config  # noqa: E402
from models.db_models import Firm  # noqa: E402
from models.pbc import PbcTemplate  # noqa: E402
from services.pbc_service import (  # noqa: E402
    DEFAULT_AUDIT_TEMPLATE_ITEMS,
    ensure_template_library,
)
from services.pbc_template_library import PBC_TEMPLATE_LIBRARY, PBC_TEMPLATE_NAMES  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed canonical Prepared by Client templates")
    parser.add_argument("--apply", action="store_true", help="Commit changes (default is dry-run)")
    parser.add_argument("--firm-id", action="append", default=[], help="Limit to a firm UUID; repeatable")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db = db_config.get_session()
    try:
        requested_firm_ids = [uuid.UUID(value) for value in args.firm_id]
        firm_query = db.query(Firm).order_by(Firm.created_at, Firm.id)
        if requested_firm_ids:
            firm_query = firm_query.filter(Firm.id.in_(requested_firm_ids))
        firms = firm_query.all()
        if requested_firm_ids and len(firms) != len(set(requested_firm_ids)):
            found = {str(firm.id) for firm in firms}
            missing = sorted(set(args.firm_id) - found)
            raise RuntimeError(f"Unknown firm id(s): {', '.join(missing)}")

        report: list[dict[str, object]] = []
        for firm in firms:
            existing = db.query(PbcTemplate).filter(
                PbcTemplate.firm_id == firm.id,
                PbcTemplate.name.in_(PBC_TEMPLATE_NAMES),
            ).all()
            existing_by_name = {row.name: row for row in existing}
            missing_names = [definition.name for definition in PBC_TEMPLATE_LIBRARY if definition.name not in existing_by_name]
            legacy_row = existing_by_name.get("Annual financial statement audit")
            expands_legacy = bool(legacy_row and legacy_row.items == DEFAULT_AUDIT_TEMPLATE_ITEMS)
            report.append({
                "firm_id": str(firm.id),
                "firm_name": firm.name,
                "existing_canonical": len(existing_by_name),
                "templates_to_create": len(missing_names),
                "legacy_audit_to_expand": expands_legacy,
            })
            if args.apply:
                ensure_template_library(db, firm.id)

        if args.apply:
            db.commit()
        else:
            db.rollback()

        total_templates = db.query(func.count(PbcTemplate.id)).scalar() if args.apply else None
        print(json.dumps({
            "mode": "apply" if args.apply else "dry-run",
            "canonical_template_count": len(PBC_TEMPLATE_LIBRARY),
            "firms_processed": len(firms),
            "created": sum(int(row["templates_to_create"]) for row in report),
            "legacy_audits_expanded": sum(bool(row["legacy_audit_to_expand"]) for row in report),
            "template_rows_after": total_templates,
            "firms": report,
        }, indent=2, default=str))
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

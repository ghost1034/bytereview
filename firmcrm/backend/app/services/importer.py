"""CSV import with dry-run validation, row-level exception report, and idempotent upsert.

Rules:
- The uploaded file is parsed in memory and never written back or modified.
- Every row is validated with the same Pydantic schema the API uses, so imports cannot bypass validation.
- Matching keys: accounts -> name (case-insensitive, incl. aliases); contacts -> email; leads -> email + company.
  Matched rows are updated (only provided, non-empty columns); unmatched rows are created.
- dry_run=True performs everything inside a transaction and rolls back, returning the same report.
- Limits: MAX_ROWS rows, MAX_BYTES bytes.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import record
from app.core.errors import DomainError
from app.models import Account, Contact, ImportJob, Lead, PracticeArea, User
from app.schemas import AccountCreate, ContactCreate, LeadCreate

MAX_ROWS = 10_000
MAX_BYTES = 5 * 1024 * 1024

# Column sets accepted per entity (beyond these, unknown columns are reported once and ignored).
COLUMNS: dict[str, list[str]] = {
    "accounts": ["name", "aliases", "account_type", "entity_kind", "industry", "website", "phone", "address", "city", "state",
                 "country", "revenue_band", "employee_band", "owner_email", "originating_partner_email", "client_since",
                 "risk_rating", "is_public_company", "tags", "description"],
    "contacts": ["first_name", "last_name", "email", "phone", "title", "account_name", "role", "owner_email", "lifecycle",
                 "do_not_contact", "linkedin", "notes"],
    "leads": ["first_name", "last_name", "company", "email", "phone", "title", "source", "status", "practice_area",
              "owner_email", "estimated_value", "need_summary", "score", "unqualified_reason"],
}
REQUIRED: dict[str, list[str]] = {"accounts": ["name"], "contacts": ["first_name", "last_name"], "leads": ["first_name", "last_name"]}
BOOL_TRUE = {"1", "true", "yes", "y", "t"}


@dataclass
class Report:
    entity: str
    dry_run: bool
    total_rows: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    exceptions: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def error(self, row: int, fld: str | None, msg: str, data: dict | None = None) -> None:
        self.exceptions.append({"row": row, "field": fld, "message": msg, "data": {k: v for k, v in (data or {}).items() if v}})


def parse_csv(raw: bytes) -> tuple[list[str], list[dict]]:
    if len(raw) > MAX_BYTES:
        raise DomainError(f"File exceeds {MAX_BYTES // (1024 * 1024)} MB limit", code="too_large", status_code=413)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise DomainError("CSV has no header row", code="bad_csv")
    headers = [h.strip().lower().replace(" ", "_") for h in reader.fieldnames]
    rows = []
    for r in reader:
        rows.append({h: (v or "").strip() for h, v in zip(headers, r.values(), strict=False)})
        if len(rows) > MAX_ROWS:
            raise DomainError(f"CSV exceeds {MAX_ROWS} rows; split the file", code="too_many_rows", status_code=413)
    return headers, rows


def template_csv(entity: str) -> str:
    if entity not in COLUMNS:
        raise DomainError("Unknown entity", status_code=404)
    buf = io.StringIO()
    csv.writer(buf).writerow(COLUMNS[entity])
    return buf.getvalue()


class _Resolver:
    def __init__(self, db: Session):
        self.db = db
        self.users = {u.email.lower(): u.id for u in db.scalars(select(User)).all()}
        self.pas = {p.name.lower(): p.id for p in db.scalars(select(PracticeArea)).all()}
        self.accounts = {a.name.lower(): a.id for a in db.scalars(select(Account)).all()}

    def user(self, email: str | None, rep: Report, row: int, fld: str, data: dict | None = None) -> int | None:
        if not email:
            return None
        uid = self.users.get(email.lower())
        if uid is None:
            rep.error(row, fld, f"no user with email {email}", data)
        return uid

    def practice_area(self, name: str | None, rep: Report, row: int, data: dict | None = None) -> int | None:
        if not name:
            return None
        pid = self.pas.get(name.lower())
        if pid is None:
            rep.error(row, "practice_area", f"unknown practice area '{name}'", data)
        return pid

    def account(self, name: str | None, rep: Report, row: int, data: dict | None = None) -> int | None:
        if not name:
            return None
        aid = self.accounts.get(name.lower())
        if aid is None:
            rep.error(row, "account_name", f"no account named '{name}'", data)
        return aid


def _bool(v: str) -> bool:
    return v.strip().lower() in BOOL_TRUE


def _blank_to_none(d: dict) -> dict:
    return {k: (None if v == "" else v) for k, v in d.items()}


def run(db: Session, entity: str, filename: str, raw: bytes, *, dry_run: bool, actor: User) -> ImportJob:
    if entity not in COLUMNS:
        raise DomainError("entity must be accounts, contacts, or leads", status_code=404)
    headers, rows = parse_csv(raw)
    rep = Report(entity=entity, dry_run=dry_run, total_rows=len(rows))
    unknown = [h for h in headers if h not in COLUMNS[entity]]
    if unknown:
        rep.warnings.append(f"ignored unknown columns: {', '.join(unknown)}")
    missing = [c for c in REQUIRED[entity] if c not in headers]
    if missing:
        raise DomainError(f"missing required columns: {', '.join(missing)}", code="bad_csv")

    res = _Resolver(db)
    handler = {"accounts": _import_account, "contacts": _import_contact, "leads": _import_lead}[entity]
    seen_keys: set[str] = set()
    for i, row in enumerate(rows, start=2):  # row 1 is the header
        before = len(rep.exceptions)
        try:
            with db.begin_nested():
                handler(db, res, row, i, rep, seen_keys)
        except ValidationError as e:
            for err in e.errors():
                rep.error(i, ".".join(str(x) for x in err["loc"]), err["msg"], row)
        except DomainError as e:
            rep.error(i, None, e.message, row)
        if len(rep.exceptions) > before:
            rep.skipped += 1

    job = ImportJob(entity=entity, filename=filename[:255], dry_run=dry_run, status="completed", total_rows=rep.total_rows,
                    created_rows=rep.created, updated_rows=rep.updated, skipped_rows=rep.skipped,
                    exceptions=rep.exceptions + ([{"row": 0, "field": None, "message": w, "data": {}} for w in rep.warnings]),
                    actor_id=actor.id)
    if dry_run:
        db.rollback()
        db.add(job)  # keep a record of the dry run for traceability
        db.commit()
        return job
    db.add(job)
    record(db, actor_id=actor.id, action=f"import.{entity}", entity_type="import_job", entity_id=None,
           after={"file": filename, "rows": rep.total_rows, "created": rep.created, "updated": rep.updated, "skipped": rep.skipped})
    db.commit()
    return job


def _import_account(db: Session, res: _Resolver, row: dict, i: int, rep: Report, seen: set[str]) -> None:
    name = row.get("name", "")
    key = name.lower()
    if key in seen:
        raise DomainError(f"duplicate name within file: '{name}'")
    seen.add(key)
    payload = _blank_to_none({k: row.get(k) for k in AccountCreate.model_fields if k in row})
    payload["owner_id"] = res.user(row.get("owner_email"), rep, i, "owner_email", row)
    payload["originating_partner_id"] = res.user(row.get("originating_partner_email"), rep, i, "originating_partner_email", row)
    if "is_public_company" in row:
        payload["is_public_company"] = _bool(row["is_public_company"])
    if "tags" in row:
        payload["tags"] = [t.strip() for t in (row["tags"] or "").split(";") if t.strip()]
    if rep.exceptions and rep.exceptions[-1]["row"] == i:
        raise DomainError("unresolved references")
    data = AccountCreate(**{k: v for k, v in payload.items() if v is not None or k in ("owner_id", "originating_partner_id")})
    existing = db.scalars(select(Account).where(func.lower(Account.name) == key)).first()
    if existing:
        for k, v in data.model_dump(exclude={"allow_duplicate"}).items():
            if k in row and row[k] != "" or k.endswith("_id") and v is not None:
                setattr(existing, k, v)
        rep.updated += 1
    else:
        acc = Account(**data.model_dump(exclude={"allow_duplicate"}))
        acc.name = acc.name.strip()
        db.add(acc)
        db.flush()
        res.accounts[key] = acc.id
        rep.created += 1


def _import_contact(db: Session, res: _Resolver, row: dict, i: int, rep: Report, seen: set[str]) -> None:
    email = (row.get("email") or "").lower() or None
    if email:
        if email in seen:
            raise DomainError(f"duplicate email within file: {email}")
        seen.add(email)
    payload = _blank_to_none({k: row.get(k) for k in ContactCreate.model_fields if k in row})
    payload["email"] = email
    payload["account_id"] = res.account(row.get("account_name"), rep, i, row)
    payload["owner_id"] = res.user(row.get("owner_email"), rep, i, "owner_email", row)
    if "do_not_contact" in row:
        payload["do_not_contact"] = _bool(row["do_not_contact"])
    if rep.exceptions and rep.exceptions[-1]["row"] == i:
        raise DomainError("unresolved references")
    data = ContactCreate(**{k: v for k, v in payload.items() if v is not None or k in ("account_id", "owner_id")})
    existing = db.scalars(select(Contact).where(func.lower(Contact.email) == email, Contact.is_archived.is_(False))).first() if email else None
    if existing:
        for k, v in data.model_dump().items():
            if (k in row and row[k] != "") or (k in ("account_id", "owner_id") and v is not None):
                setattr(existing, k, v)
        rep.updated += 1
    else:
        c = Contact(**data.model_dump())
        if c.owner_id is None:
            c.owner_id = None
        db.add(c)
        db.flush()
        rep.created += 1


def _import_lead(db: Session, res: _Resolver, row: dict, i: int, rep: Report, seen: set[str]) -> None:
    email = (row.get("email") or "").lower() or None
    company = row.get("company") or ""
    key = f"{email}|{company.lower()}"
    if email and key in seen:
        raise DomainError(f"duplicate lead within file: {email} / {company}")
    seen.add(key)
    payload = _blank_to_none({k: row.get(k) for k in LeadCreate.model_fields if k in row})
    payload["email"] = email
    payload["practice_area_id"] = res.practice_area(row.get("practice_area"), rep, i, row)
    payload["owner_id"] = res.user(row.get("owner_email"), rep, i, "owner_email", row)
    if rep.exceptions and rep.exceptions[-1]["row"] == i:
        raise DomainError("unresolved references")
    data = LeadCreate(**{k: v for k, v in payload.items() if v is not None or k in ("practice_area_id", "owner_id")})
    existing = None
    if email:
        existing = db.scalars(select(Lead).where(func.lower(Lead.email) == email, func.lower(Lead.company) == company.lower(),
                                                 Lead.status != "converted", Lead.is_archived.is_(False))).first()
    if existing:
        for k, v in data.model_dump().items():
            if (k in row and row[k] != "") or (k in ("practice_area_id", "owner_id") and v is not None):
                setattr(existing, k, v)
        rep.updated += 1
    else:
        db.add(Lead(**data.model_dump()))
        db.flush()
        rep.created += 1

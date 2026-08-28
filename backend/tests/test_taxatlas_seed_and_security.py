from __future__ import annotations

import runpy
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from models.db_models import Base
from taxatlas.api import deps
from taxatlas.api.v1.account import remove_watch
from taxatlas.crawler.runner import run_source
from taxatlas.models import ChangeEvent, CrawlStatus, DeliveryAttempt, DeliveryChannel, Jurisdiction, Regulation, SeedRun, Source, WatchItem
from taxatlas.models.enums import ChangeType, EntityType
from taxatlas.seed.runner import run_seed
from taxatlas.services import notifications


@pytest.fixture()
def taxatlas_db() -> Session:
    migration = runpy.run_path(
        str(Path(__file__).parents[1] / "alembic" / "versions" / "078_taxatlas_module.py")
    )
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id VARCHAR(128) PRIMARY KEY)"))
    for table in migration["_tables"]():
        table.create(engine, checkfirst=True)
    with Session(engine) as session:
        yield session


def test_migration_creates_every_namespaced_table_in_dependency_order(taxatlas_db: Session):
    names = set(taxatlas_db.bind.dialect.get_table_names(taxatlas_db.connection()))
    expected = {name for name in Base.metadata.tables if name.startswith("taxatlas_")}
    assert expected <= names
    assert len(expected) == 15


def test_seed_is_idempotent_and_preserves_admin_and_runtime_state(taxatlas_db: Session):
    first = run_seed(taxatlas_db)
    assert first["already_applied"] is False
    assert "users_created" not in first["counts"]

    source = taxatlas_db.scalar(select(Source).order_by(Source.id))
    jurisdiction = taxatlas_db.scalar(select(Jurisdiction).where(Jurisdiction.code == "US"))
    assert source is not None and jurisdiction is not None
    source.enabled = False
    source.consecutive_failures = 7
    jurisdiction.name = "Administrator correction"
    taxatlas_db.add(
        ChangeEvent(
            entity_type=EntityType.JURISDICTION,
            entity_id=jurisdiction.id,
            jurisdiction_id=jurisdiction.id,
            change_type=ChangeType.UPDATED,
            title="Admin correction",
            new_value={"_meta": {"edited_by": "firebase-admin"}},
        )
    )
    taxatlas_db.delete(taxatlas_db.scalar(select(SeedRun)))
    taxatlas_db.commit()

    rerun = run_seed(taxatlas_db)
    assert rerun["already_applied"] is False
    taxatlas_db.refresh(source)
    taxatlas_db.refresh(jurisdiction)
    assert source.enabled is False
    assert source.consecutive_failures == 7
    assert jurisdiction.name == "Administrator correction"
    assert rerun["counts"]["jurisdictions_protected"] >= 1

    skipped = run_seed(taxatlas_db)
    assert skipped["already_applied"] is True


def test_api_key_rechecks_paid_status_and_rejects_revocation(monkeypatch):
    row = SimpleNamespace(
        revoked_at=None,
        user=SimpleNamespace(id="firebase-user"),
        user_id="firebase-user",
    )
    db = SimpleNamespace(scalar=lambda _query: row)

    def downgraded(_db, _user_id):
        raise HTTPException(403, {"code": "taxatlas_paid_plan_required"})

    monkeypatch.setattr(deps, "_paid", downgraded)
    with pytest.raises(HTTPException) as denied:
        deps._load_api_key(db, "ta_test")
    assert denied.value.status_code == 403

    row.revoked_at = object()
    with pytest.raises(HTTPException) as revoked:
        deps._load_api_key(db, "ta_test")
    assert revoked.value.status_code == 401


def test_fixture_crawler_pipeline_is_idempotent(taxatlas_db: Session):
    run_seed(taxatlas_db)
    source = taxatlas_db.scalar(select(Source).where(Source.slug == "fixture-irs-newsroom"))
    assert source is not None

    first = run_source(taxatlas_db, source, triggered_by="test")
    second = run_source(taxatlas_db, source, triggered_by="test")
    assert first.status == CrawlStatus.SUCCESS
    assert first.items_found == 10 and first.items_new == 10
    assert second.status == CrawlStatus.SUCCESS
    assert second.items_found == 10 and second.items_new == 0 and second.items_changed == 0
    assert len(list(taxatlas_db.scalars(select(Regulation).where(Regulation.source_id == source.id)))) == 10


def test_account_object_access_is_owner_scoped(taxatlas_db: Session):
    item = WatchItem(user_id="owner", tax_type="vat", include_children=True)
    taxatlas_db.add(item)
    taxatlas_db.commit()

    with pytest.raises(HTTPException) as denied:
        remove_watch(item.id, user=SimpleNamespace(id="another-user"), db=taxatlas_db)
    assert denied.value.status_code == 404
    assert taxatlas_db.get(WatchItem, item.id) is not None


def test_webhook_secrets_are_encrypted_and_kms_is_required_in_production(monkeypatch):
    channel = DeliveryChannel(user_id="firebase-user", kind="webhook", target="https://example.com")
    channel.secret = "top-secret"
    assert channel.secret_ciphertext != b"top-secret"
    assert channel.secret == "top-secret"

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr("taxatlas.models.delivery.encryption_service.use_kms", False)
    with pytest.raises(RuntimeError, match="require Google Cloud KMS"):
        channel.secret = "replacement"


def test_webhook_signatures_rotation_grace_and_replay_protection():
    body = b'{"event":"change.detected"}'
    timestamp = 1_800_000_000
    signature = notifications.sign_v2("current", timestamp, body)
    assert notifications.verify_signature_v2("current", body, str(timestamp), signature, now=timestamp)
    assert not notifications.verify_signature_v2("current", body, str(timestamp), signature, now=timestamp + 301)
    assert not notifications.verify_signature_v2("wrong", body, str(timestamp), signature, now=timestamp)

    now = notifications.utcnow()
    channel = DeliveryChannel(user_id="firebase-user", kind="webhook", target="https://example.com")
    channel.previous_secret = "rotated-out"
    channel.previous_secret_expires_at = now + notifications.SECRET_ROTATION_GRACE
    assert notifications.previous_secret_in_grace(channel, now) == "rotated-out"
    assert notifications.previous_secret_in_grace(
        channel, now + notifications.SECRET_ROTATION_GRACE
    ) is None


@pytest.mark.parametrize(
    "target",
    [
        "http://127.0.0.1/hook",
        "http://169.254.169.254/latest/meta-data",
        "http://user:password@example.com/hook",
        "ftp://example.com/hook",
    ],
)
def test_webhook_ssrf_rejects_non_public_targets(target: str):
    with pytest.raises(ValueError):
        notifications.validate_target_url(target, allow_private=False)


def test_delivery_failures_back_off_then_dead_letter(taxatlas_db: Session, monkeypatch):
    settings = notifications.get_settings()
    monkeypatch.setattr(settings, "notify_max_attempts", 2)
    now = notifications.utcnow()
    channel = DeliveryChannel(
        user_id="firebase-user",
        kind="webhook",
        target="https://example.com/hook",
        secret="secret",
        enabled=True,
        digest="instant",
        consecutive_failures=0,
    )
    taxatlas_db.add(channel)
    taxatlas_db.flush()
    first = DeliveryAttempt(channel_id=channel.id, notification_id=1, attempt_no=1, status="pending")
    taxatlas_db.add(first)
    taxatlas_db.commit()
    stats = {"sent": 0, "failed": 0, "dead": 0, "auto_disabled": 0}

    notifications._record_result(
        taxatlas_db,
        channel,
        [first],
        now=now,
        http_status=503,
        error="HTTP 503",
        stats=stats,
    )
    assert first.status == "failed"
    assert first.next_attempt_at.replace(tzinfo=notifications.UTC) == now + notifications.backoff_for(1)
    assert stats["failed"] == 1

    second = DeliveryAttempt(channel_id=channel.id, notification_id=1, attempt_no=2, status="pending")
    taxatlas_db.add(second)
    taxatlas_db.commit()
    notifications._record_result(
        taxatlas_db,
        channel,
        [second],
        now=now,
        http_status=503,
        error="HTTP 503",
        stats=stats,
    )
    assert second.status == "dead"
    assert second.next_attempt_at is None
    assert stats["dead"] == 1

from __future__ import annotations

import os
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models.db_models import Base
from models.tasklytic import (
    TasklyticCommand, TasklyticCommandRun, TasklyticEntityRecord,
    TasklyticExternalReference, TasklyticFileUpload, TasklyticIntegrationConnection,
    TasklyticInvitation, TasklyticUsageEvent, TasklyticWebhookReceipt, TasklyticWorkspace,
    TasklyticWorkspaceEvent, TasklyticWorkspaceMember,
)
from services.tasklytic_integrations import (
    create_stripe_payment_link, extract_receipt, import_google_drive_files,
    list_google_drive_files, queue_email_delivery, reconcile_stripe_event,
    record_usage_event, upsert_connection,
)
from services.tasklytic_service import provision_bundle, upsert_record


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[
        TasklyticWorkspace.__table__, TasklyticWorkspaceMember.__table__,
        TasklyticEntityRecord.__table__, TasklyticWorkspaceEvent.__table__,
        TasklyticInvitation.__table__,
        TasklyticCommand.__table__, TasklyticCommandRun.__table__, TasklyticFileUpload.__table__,
        TasklyticIntegrationConnection.__table__, TasklyticExternalReference.__table__,
        TasklyticWebhookReceipt.__table__, TasklyticUsageEvent.__table__,
    ])
    session = sessionmaker(bind=engine)()
    provision_bundle(session, {
        "workspace": {"id": "w1", "name": "Launch Firm", "memberIds": ["owner"], "adminIds": ["owner"], "createdAt": "2026-01-01T00:00:00Z"},
        "user": {"id": "owner", "name": "Owner", "email": "owner@example.com", "avatarColor": "#000", "role": "admin", "createdAt": "2026-01-01T00:00:00Z"},
        "team": {"id": "team1", "workspaceId": "w1", "name": "General", "memberIds": ["owner"], "adminIds": ["owner"], "privacy": "public"},
        "project": {"id": "p1", "workspaceId": "w1", "teamId": "team1", "name": "Launch", "privacy": "private_to_members", "memberIds": ["owner"], "ownerId": "owner", "attachmentIds": []},
    }, {"uid": "owner", "email": "owner@example.com"})
    session.commit()
    yield session
    session.close()


class FakeBlob:
    def __init__(self, name: str, objects: dict[str, bytes]): self.name, self.objects = name, objects
    def upload_from_string(self, content: bytes, content_type: str): self.objects[self.name] = content


class FakeStorage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.bucket = SimpleNamespace(blob=lambda name: FakeBlob(name, self.objects))


class PartialDrive:
    def list_drive_files(self, *_args, **_kwargs):
        return {"files": [{"id": "ok", "name": "receipt.png", "mimeType": "image/png", "size": "3"}]}
    def get_drive_file_metadata(self, _db, _actor, file_id):
        if file_id == "revoked": return None
        return {"id": file_id, "name": f"{file_id}.png", "mimeType": "image/png", "modifiedTime": "2026-08-12T00:00:00Z"}
    def download_drive_file(self, _db, _actor, file_id): return None if file_id == "revoked" else b"png"


def test_drive_sandbox_import_preserves_success_on_partial_failure_and_marks_revocation(db):
    upsert_connection(db, workspace_id="w1", provider="google_drive", owner_user_id="owner")
    storage = FakeStorage()
    result = import_google_drive_files(
        db, workspace_id="w1", actor_id="owner", scope_type="project", scope_id="p1",
        file_ids=["ok", "revoked"], drive=PartialDrive(), storage_factory=lambda: storage,
    )
    db.commit()
    assert result["status"] == "partial" and len(result["imported"]) == 1 and len(result["failures"]) == 1
    attachment_id = result["imported"][0]["attachmentId"]
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="attachments", record_id=attachment_id).count() == 1
    assert db.query(TasklyticExternalReference).filter_by(external_id="ok").one().sync_status == "synchronized"
    assert db.query(TasklyticExternalReference).filter_by(external_id="revoked").one().sync_status == "failed"
    assert db.query(TasklyticIntegrationConnection).filter_by(provider="google_drive").one().status == "revoked"
    assert storage.objects


def test_drive_replay_and_external_id_conflict_do_not_duplicate_or_reparent_records(db):
    upsert_connection(db, workspace_id="w1", provider="google_drive", owner_user_id="owner")
    storage = FakeStorage(); drive = PartialDrive()
    first = import_google_drive_files(db, workspace_id="w1", actor_id="owner", scope_type="project", scope_id="p1", file_ids=["ok"], drive=drive, storage_factory=lambda: storage)
    second = import_google_drive_files(db, workspace_id="w1", actor_id="owner", scope_type="project", scope_id="p1", file_ids=["ok"], drive=drive, storage_factory=lambda: storage)
    assert first["imported"][0]["replayed"] is False and second["imported"][0]["replayed"] is True
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="attachments").count() == 1
    upsert_record(db, "projects", {"id": "p2", "workspaceId": "w1", "teamId": "team1", "name": "Other", "ownerId": "owner", "memberIds": ["owner"], "privacy": "private_to_members", "attachmentIds": []}, "owner", "w1")
    conflict = import_google_drive_files(db, workspace_id="w1", actor_id="owner", scope_type="project", scope_id="p2", file_ids=["ok"], drive=drive, storage_factory=lambda: storage)
    assert conflict["status"] == "failed" and conflict["failures"][0]["code"] == "external_id_conflict"
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="projects", record_id="p2").one().payload["attachmentIds"] == []


def test_revoked_drive_listing_returns_reconnect_error_without_deleting_local_records(db):
    upsert_connection(db, workspace_id="w1", provider="google_drive", owner_user_id="owner")
    drive = SimpleNamespace(list_drive_files=lambda *_args, **_kwargs: None)
    with pytest.raises(Exception) as exc:
        list_google_drive_files(db, workspace_id="w1", actor_id="owner", query=None, page_token=None, drive=drive)
    assert exc.value.status_code == 401 and exc.value.detail["code"] == "credentials_revoked"
    assert db.query(TasklyticWorkspace).count() == 1


def test_vertex_receipt_extraction_keeps_manual_fallback():
    success = extract_receipt(b"receipt", "image/png", extractor=lambda *_: {"vendor": "Cafe", "date": "2026-08-11", "amount": 12.5, "taxAmount": 1.0, "currency": "usd"})
    fallback = extract_receipt(b"receipt", "image/png", extractor=lambda *_: (_ for _ in ()).throw(RuntimeError("Vertex unavailable")))
    assert success == {"status": "extracted", "manualAllowed": True, "receipt": {"vendor": "Cafe", "date": "2026-08-11", "amount": 12.5, "taxAmount": 1.0, "currency": "USD"}}
    assert fallback["status"] == "manual_required" and fallback["manualAllowed"] is True


def test_gmail_failure_is_durable_and_retryable_instead_of_losing_delivery(db):
    sender = SimpleNamespace(send_html_email=lambda *_args, **_kwargs: False)
    command, replayed = queue_email_delivery(
        db, workspace_id="w1", actor_id="owner",
        body={"to": "client@example.com", "subject": "Invoice", "bodyText": "Attached"},
        idempotency_key="delivery-1", sender=sender,
    )
    db.commit()
    assert replayed is False and command.status == "retry" and command.attempt_count == 1 and command.max_attempts == 5
    assert command.payload["recipients"] == ["client@example.com"]
    replay, replayed = queue_email_delivery(db, workspace_id="w1", actor_id="owner", body={"to": "client@example.com"}, idempotency_key="delivery-1", sender=sender)
    assert replayed is True and replay.id == command.id


class FakeStripe:
    class checkout:
        class Session:
            @staticmethod
            def create(**kwargs):
                assert kwargs["metadata"]["scope"] == "tasklytic_client_invoice"
                assert kwargs["stripe_account"] == "acct_client"
                return {"id": "cs_1", "url": "https://checkout.stripe.test/cs_1"}


def _seed_invoice(db):
    upsert_record(db, "clients", {"id": "c1", "workspaceId": "w1", "name": "Client", "type": "business", "paymentTerms": "net_30", "defaultCurrency": "USD", "archived": False, "createdAt": "2026-01-01T00:00:00Z"}, "owner", "w1")
    return upsert_record(db, "invoices", {"id": "i1", "workspaceId": "w1", "clientId": "c1", "clientName": "Client", "invoiceNumber": "INV-1", "status": "sent", "amount": 25, "total": 25, "amountPaid": 0, "amountOutstanding": 25, "currency": "USD", "dueOn": "2026-09-01", "lineItems": [], "createdAt": "2026-08-01T00:00:00Z"}, "owner", "w1", internal_billing_action=True)


def test_stripe_connect_link_reconciliation_and_replay_are_invoice_scoped(db):
    _seed_invoice(db)
    upsert_connection(db, workspace_id="w1", provider="stripe_connect", owner_user_id="owner", external_account_id="acct_client")
    link = create_stripe_payment_link(db, workspace_id="w1", actor_id="owner", invoice_id="i1", success_url="https://app.test/success", cancel_url="https://app.test/cancel", stripe_client=FakeStripe)
    assert link["scope"] == "client_invoice" and link["checkoutSessionId"] == "cs_1"
    event = {"id": "evt_1", "type": "checkout.session.completed", "account": "acct_client", "data": {"object": {"id": "cs_1", "payment_status": "paid", "amount_total": 2500, "currency": "usd", "payment_intent": "pi_1", "metadata": {"scope": "tasklytic_client_invoice", "workspace_id": "w1", "invoice_id": "i1"}}}}
    first = reconcile_stripe_event(db, event)
    second = reconcile_stripe_event(db, event)
    assert first["status"] == "processed" and second == {"replayed": True, "status": "processed", "localId": first["payment"]["id"]}
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="payments").count() == 1
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="invoices", record_id="i1").one().payload["status"] == "paid"


def test_workspace_plan_stripe_event_is_ignored_by_client_invoice_reconciler(db):
    event = {"id": "evt_plan", "type": "checkout.session.completed", "data": {"object": {"metadata": {"scope": "workspace_plan"}}}}
    assert reconcile_stripe_event(db, event)["status"] == "ignored"
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="payments").count() == 0


def test_first_party_usage_events_drop_sensitive_properties(db):
    result = record_usage_event(db, workspace_id="w1", actor_id="owner", event_name="invoice.viewed", properties={"invoiceId": "i1", "email": "client@example.com", "secretToken": "nope", "count": 1})
    row = db.query(TasklyticUsageEvent).filter_by(event_name="invoice.viewed").one()
    assert row.properties == {"invoiceId": "i1", "count": 1}

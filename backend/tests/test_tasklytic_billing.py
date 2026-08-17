from __future__ import annotations

import os
import io
import base64
import hashlib

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
import pdfplumber
from pypdf import PdfReader
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from models.db_models import Base
from models.tasklytic import (
    TasklyticEntityRecord, TasklyticWorkspace, TasklyticWorkspaceEvent,
    TasklyticWorkspaceMember, TasklyticInvitation,
    TasklyticCommand, TasklyticCommandRun,
    TasklyticFileUpload,
)
from core.database import get_db
from dependencies.auth import verify_firebase_token
from routes.tasklytic import router as tasklytic_router
from services.tasklytic_billing import (
    create_fx_quote, finalize_invoice_delivery, generate_invoice, invoice_action, invoice_pdf,
    record_payment, record_trust_transaction, reverse_payment,
    reverse_trust_transaction,
)
from services.tasklytic_reporting import reporting_sources_payload
from services.email_service import email_service
from services.tasklytic_invoice_document import render_invoice_pdf
from services.tasklytic_psa import execute_psa_action
from services.tasklytic_service import delete_record, provision_bundle, upsert_record


ECB_FIXTURE = b'''<?xml version="1.0"?><Envelope><Cube><Cube time="2026-08-11"><Cube currency="USD" rate="1.20"/><Cube currency="GBP" rate="0.80"/></Cube></Cube></Envelope>'''


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[
        TasklyticWorkspace.__table__, TasklyticWorkspaceMember.__table__,
        TasklyticEntityRecord.__table__, TasklyticWorkspaceEvent.__table__,
        TasklyticInvitation.__table__,
        TasklyticCommand.__table__, TasklyticCommandRun.__table__,
        TasklyticFileUpload.__table__,
    ])
    session = sessionmaker(bind=engine)()
    provision_bundle(session, {
        "workspace": {
            "id": "w1", "name": "Billing Firm", "memberIds": ["owner"], "adminIds": ["owner"],
            "defaultCurrency": "USD", "invoicePrefix": "INV-", "invoiceStartNumber": 1001,
            "billingSettings": {"invoiceApprovalRequired": True, "invoiceApproverIds": ["approver"]},
            "createdAt": "2026-01-01T00:00:00Z",
        },
        "user": {"id": "owner", "name": "Owner", "email": "owner@example.com", "avatarColor": "#000", "role": "admin", "createdAt": "2026-01-01T00:00:00Z"},
        "team": {"id": "team1", "workspaceId": "w1", "name": "General", "memberIds": ["owner"], "adminIds": ["owner"], "privacy": "public"},
        "project": {"id": "p1", "workspaceId": "w1", "teamId": "team1", "name": "Tax", "privacy": "private_to_members", "memberIds": ["owner"], "ownerId": "owner"},
    }, {"uid": "owner", "email": "owner@example.com"})
    for user_id, flags in {
        "billing": {"canBill": True},
        "payments": {"canRecordPayments": True},
        "trust": {"canManageTrust": True, "canRecordPayments": True},
        "rates": {"canManageRates": True},
        "approver": {"canApprove": True, "canBill": True},
        "member": {},
    }.items():
        session.add(TasklyticWorkspaceMember(workspace_id="w1", user_id=user_id, role="member"))
        upsert_record(session, "users", {
            "id": user_id, "name": user_id, "email": f"{user_id}@example.com", "avatarColor": "#123",
            "role": "member", "roleFlags": flags, "createdAt": "2026-01-01T00:00:00Z",
        }, "owner", "w1")
    client = {
        "id": "c1", "workspaceId": "w1", "name": "Client", "type": "business",
        "paymentTerms": "net_30", "defaultCurrency": "USD", "retainerBalance": 0,
        "archived": False, "createdAt": "2026-01-01T00:00:00Z",
    }
    upsert_record(session, "clients", client, "owner", "w1")
    session.commit()
    yield session
    session.close()


@pytest.fixture()
def api(db):
    app = FastAPI(); app.include_router(tasklytic_router)
    def override_db(): yield db
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[verify_firebase_token] = lambda: {"uid": "owner", "email": "owner@example.com", "email_verified": True}
    return TestClient(app)


def seed_source(db, record_id: str, *, kind: str = "timeEntries", currency: str = "USD", amount: float = 200) -> None:
    if kind == "timeEntries":
        payload = {
            "id": record_id, "workspaceId": "w1", "userId": "owner", "projectId": "p1", "clientId": "c1",
            "description": "Advisory work", "hours": 2, "date": "2026-08-11", "billable": True,
            "rateSnapshot": amount / 2, "amount": amount, "currency": currency, "status": "approved",
            "createdAt": "2026-08-11T00:00:00Z",
        }
    else:
        payload = {
            "id": record_id, "workspaceId": "w1", "userId": "owner", "projectId": "p1", "clientId": "c1",
            "description": "Filing fee", "amount": amount, "billableAmount": amount, "currency": currency,
            "category": "filing_fees", "date": "2026-08-11", "billable": True, "status": "approved",
            "createdAt": "2026-08-11T00:00:00Z",
        }
    db.add(TasklyticEntityRecord(
        entity_kind=kind, record_id=record_id, scope_key="w:w1", workspace_id="w1", payload=payload,
    ))
    db.flush()


def generate(db, **overrides):
    body = {
        "clientId": "c1", "timeEntryIds": ["time1"], "expenseIds": [],
        "currency": "USD", "periodStart": "2026-08-01", "periodEnd": "2026-08-11",
        "issueDate": "2026-08-12", "dueOn": "2026-09-11", "narratives": {"time1": "Tax advisory"},
        **overrides,
    }
    return generate_invoice(db, workspace_id="w1", actor_id="owner", body=body)


def test_invoice_generation_is_atomic_locks_sources_and_financial_records_are_immutable(db):
    seed_source(db, "time1")
    seed_source(db, "expense1", kind="expenses", amount=50)
    result = generate(db, expenseIds=["expense1"], discountAmount=25, discountReason="Courtesy")
    invoice = result["invoice"]
    assert invoice["invoiceNumber"] == "INV-1001"
    assert invoice["total"] == 225
    assert invoice["lineItems"][0]["description"] == "Tax advisory"
    for kind, record_id in (("timeEntries", "time1"), ("expenses", "expense1")):
        source = db.query(TasklyticEntityRecord).filter_by(entity_kind=kind, record_id=record_id).one().payload
        assert source["status"] == "billed" and source["invoiceId"] == invoice["id"]
        lock = db.query(TasklyticEntityRecord).filter_by(entity_kind="billingLocks", record_id=f"{kind}:{record_id}").one().payload
        assert lock["status"] == "active"
    with pytest.raises(HTTPException) as edit_exc:
        upsert_record(db, "invoices", {**invoice, "notes": "tamper"}, "owner", "w1", invoice["revision"])
    assert edit_exc.value.detail["code"] == "billing_command_required"
    with pytest.raises(HTTPException) as delete_exc:
        delete_record(db, "invoices", invoice["id"], "owner", "w1", invoice["revision"])
    assert delete_exc.value.detail["code"] == "immutable_billing_record"


def test_invoice_generation_requires_an_explicit_period(db):
    seed_source(db, "time1")

    with pytest.raises(HTTPException) as missing_start:
        generate(db, periodStart=None)
    assert missing_start.value.status_code == 422
    assert missing_start.value.detail == "periodStart must be an ISO date"

    with pytest.raises(HTTPException) as missing_end:
        generate(db, periodEnd=None)
    assert missing_end.value.status_code == 422
    assert missing_end.value.detail == "periodEnd must be an ISO date"


def test_task_time_inherits_linked_matter_context_and_reaches_invoice(db):
    upsert_record(db, "tasks", {
        "id": "task-from-project", "workspaceId": "w1", "name": "Prepare return",
        "projectIds": ["p1"], "sectionIdByProject": {},
    }, "owner", "w1")
    upsert_record(db, "matters", {
        "id": "m1", "workspaceId": "w1", "projectId": "p1", "clientId": "c1",
        "matterNumber": "ENG-1", "practiceArea": "Tax", "responsibleAttorneyId": "owner",
        "originatingAttorneyId": "owner", "feeArrangement": "hourly", "openedAt": "2026-01-01",
        "status": "active", "conflictStatus": "cleared",
    }, "owner", "w1")
    entry = upsert_record(db, "timeEntries", {
        "id": "time1", "workspaceId": "w1", "userId": "owner", "taskId": "task-from-project",
        "description": "Prepare return", "hours": 2, "date": "2026-08-11",
        "billable": True, "rateSnapshot": 200, "rateSource": "matter", "amount": 400,
        "currency": "USD", "status": "draft", "createdAt": "2026-08-11T00:00:00Z",
    }, "owner", "w1")

    assert entry["projectId"] == "p1"
    assert entry["matterId"] == "m1"
    assert entry["clientId"] == "c1"

    execute_psa_action(
        db, kind="timeEntries", record_id="time1", action="submit", body={},
        actor_id="owner", workspace_id="w1",
    )
    execute_psa_action(
        db, kind="timeEntries", record_id="time1", action="approve", body={},
        actor_id="approver", workspace_id="w1",
    )
    invoice = generate(db)["invoice"]
    assert invoice["total"] == 400
    assert invoice["matterIds"] == ["m1"]


def test_zero_rate_override_requires_a_reason(db):
    payload = {
        "id": "zero-time", "workspaceId": "w1", "userId": "owner", "projectId": "p1",
        "clientId": "c1", "description": "Courtesy work", "hours": 1, "date": "2026-08-11",
        "billable": True, "rateSnapshot": 0, "rateSource": "override", "amount": 0,
        "currency": "USD", "status": "draft", "createdAt": "2026-08-11T00:00:00Z",
    }
    with pytest.raises(HTTPException) as missing_reason:
        upsert_record(db, "timeEntries", payload, "owner", "w1")
    assert missing_reason.value.detail["code"] == "zero_rate_reason_required"

    saved = upsert_record(
        db, "timeEntries", {**payload, "rateOverrideReason": "Approved courtesy"}, "owner", "w1",
    )
    assert saved["rateOverrideReason"] == "Approved courtesy"


def test_matter_invoice_includes_and_backfills_legacy_project_sources(db):
    upsert_record(db, "matters", {
        "id": "matter1", "workspaceId": "w1", "projectId": "p1", "clientId": "c1",
        "matterNumber": "ENG-2026-071", "practiceArea": "Tax",
        "responsibleAttorneyId": "owner", "originatingAttorneyId": "owner",
        "feeArrangement": "hourly", "openedAt": "2026-01-01",
        "status": "active", "conflictStatus": "cleared",
    }, "owner", "w1")
    seed_source(db, "time1")

    invoice = generate(db, matterId="matter1")["invoice"]

    assert invoice["matterIds"] == ["matter1"]
    source = db.query(TasklyticEntityRecord).filter_by(entity_kind="timeEntries", record_id="time1").one().payload
    assert source["matterId"] == "matter1"


def test_currency_separation_requires_an_explicit_quote_and_ecb_cache_is_reused(db):
    seed_source(db, "time1", currency="GBP", amount=80)
    with pytest.raises(HTTPException) as mismatch:
        generate(db)
    assert mismatch.value.detail["code"] == "fx_quote_required"
    calls = 0
    def fetcher():
        nonlocal calls
        calls += 1
        return ECB_FIXTURE
    quote = create_fx_quote(db, workspace_id="w1", actor_id="rates", body={
        "baseCurrency": "GBP", "quoteCurrency": "USD", "rateDate": "2026-08-11",
    }, fetcher=fetcher)["quote"]
    second = create_fx_quote(db, workspace_id="w1", actor_id="rates", body={
        "baseCurrency": "GBP", "quoteCurrency": "USD", "rateDate": "2026-08-11",
    }, fetcher=fetcher)["quote"]
    assert calls == 1
    assert quote["rate"] == second["rate"] == 1.5
    invoice = generate(db, fxQuoteIds=[quote["id"]])["invoice"]
    assert invoice["total"] == 120
    assert invoice["lineItems"][0]["fxQuoteId"] == quote["id"]


def test_workspace_override_supports_non_ecb_currency(db):
    workspace = db.get(TasklyticWorkspace, "w1")
    workspace.payload = {**workspace.payload, "fxOverrides": {"USD/XYZ": {"rate": 7.25, "effectiveOn": "2026-08-01", "note": "Treasury quote"}}}
    quote = create_fx_quote(db, workspace_id="w1", actor_id="rates", body={
        "baseCurrency": "USD", "quoteCurrency": "XYZ", "rateDate": "2026-08-11",
    })["quote"]
    assert quote["source"] == "workspace_override"
    assert quote["rate"] == 7.25


def test_rate_cards_activity_codes_and_budgets_enforce_rate_capability_and_versioning(db):
    card = {"id": "card1", "workspaceId": "w1", "name": "Standard", "currency": "USD", "effectiveFrom": "2026-01-01", "rates": []}
    with pytest.raises(HTTPException) as denied:
        upsert_record(db, "rateCards", card, "member", "w1")
    assert denied.value.detail == {"code": "capability_denied", "capability": "rate"}
    upsert_record(db, "rateCards", card, "rates", "w1")
    upsert_record(db, "activityCodes", {"id": "A101", "workspaceId": "w1", "code": "A101", "name": "Plan", "active": True, "createdAt": "2026-08-12T00:00:00Z"}, "rates", "w1")
    budget = upsert_record(db, "billingBudgets", {"id": "budget1", "workspaceId": "w1", "scope": "client", "scopeId": "c1", "currency": "USD", "amount": 10000, "effectiveFrom": "2026-01-01", "createdAt": "2026-01-01T00:00:00Z"}, "rates", "w1")
    assert budget["amount"] == 10000
    rate = upsert_record(db, "billingRates", {"id": "rate1", "workspaceId": "w1", "scope": "workspace", "role": "Manager", "hourlyRate": 250, "currency": "USD", "effectiveFrom": "2026-01-01", "createdAt": "2026-01-01T00:00:00Z"}, "rates", "w1")
    with pytest.raises(HTTPException) as immutable:
        upsert_record(db, "billingRates", {**rate, "hourlyRate": 275}, "rates", "w1", rate["revision"])
    assert immutable.value.detail["code"] == "billing_rate_version_required"


def test_invoice_payment_trust_reversal_and_void_state_machines_are_append_only(db):
    seed_source(db, "time1")
    invoice = generate(db)["invoice"]
    submitted = invoice_action(db, invoice_id=invoice["id"], action="submit", workspace_id="w1", actor_id="owner", body={})["invoice"]
    assert submitted["status"] == "pending_approval"
    with pytest.raises(HTTPException) as route_exc:
        invoice_action(db, invoice_id=invoice["id"], action="approve", workspace_id="w1", actor_id="billing", body={})
    assert route_exc.value.detail["code"] == "capability_denied"
    approved = invoice_action(db, invoice_id=invoice["id"], action="approve", workspace_id="w1", actor_id="approver", body={})["invoice"]
    queued = invoice_action(db, invoice_id=invoice["id"], action="send", workspace_id="w1", actor_id="billing", body={"method": "email", "recipient": "client@example.com"})["invoice"]
    assert approved["status"] == "approved" and queued["status"] == "approved"
    assert queued["deliveryHistory"][-1]["status"] == "queued"
    sent = invoice_action(db, invoice_id=invoice["id"], action="send", workspace_id="w1", actor_id="billing", body={"method": "manual"})["invoice"]
    assert sent["status"] == "sent"

    deposit = record_trust_transaction(db, workspace_id="w1", actor_id="trust", body={
        "clientId": "c1", "type": "deposit", "amount": 300, "currency": "USD", "reference": "WIRE-1",
    })["transaction"]
    payment_result = record_payment(db, invoice_id=invoice["id"], workspace_id="w1", actor_id="trust", body={
        "amount": 200, "currency": "USD", "method": "trust_application", "paidAt": "2026-08-12",
    })
    assert payment_result["invoice"]["status"] == "paid"
    assert payment_result["trustTransaction"]["balanceAfter"] == 100
    reversal = reverse_payment(db, payment_id=payment_result["payment"]["id"], workspace_id="w1", actor_id="trust", body={"reason": "Returned check"})
    assert reversal["reversal"]["amount"] == -200
    assert reversal["invoice"]["status"] == "sent"
    assert reversal["trustTransaction"]["balanceAfter"] == 300
    original_payment = db.query(TasklyticEntityRecord).filter_by(entity_kind="payments", record_id=payment_result["payment"]["id"]).one().payload
    assert original_payment["amount"] == 200 and original_payment["status"] == "posted"

    voided = invoice_action(db, invoice_id=invoice["id"], action="void", workspace_id="w1", actor_id="billing", body={"reason": "Rebill"})["invoice"]
    assert voided["status"] == "void"
    source = db.query(TasklyticEntityRecord).filter_by(entity_kind="timeEntries", record_id="time1").one().payload
    assert source["status"] == "approved" and source["invoiceId"] is None
    trust_reversal = reverse_trust_transaction(db, transaction_id=deposit["id"], workspace_id="w1", actor_id="trust", body={"reason": "Deposit returned"})
    assert trust_reversal["reversal"]["balanceAfter"] == 0


def test_payment_and_trust_authorization_and_overdraw_controls(db):
    with pytest.raises(HTTPException) as payment_denied:
        record_trust_transaction(db, workspace_id="w1", actor_id="member", body={"clientId": "c1", "type": "deposit", "amount": 5})
    assert payment_denied.value.status_code == 403
    with pytest.raises(HTTPException) as overdrawn:
        record_trust_transaction(db, workspace_id="w1", actor_id="trust", body={"clientId": "c1", "type": "withdrawal", "amount": 5})
    assert overdrawn.value.detail["code"] == "insufficient_trust_funds"


def test_pdf_and_phase9_reporting_sources(db):
    seed_source(db, "time1")
    invoice = generate(db)["invoice"]
    content, digest = invoice_pdf(db, invoice_id=invoice["id"], workspace_id="w1", actor_id="owner")
    assert content.startswith(b"%PDF-1.4") and content.endswith(b"%%EOF\n")
    assert len(digest) == 64
    sources = {source["id"] for source in reporting_sources_payload()}
    assert {"invoices", "payments", "realization", "effective_rate", "ar_aging"} <= sources


def test_billing_api_commands_are_idempotent_and_pdf_is_downloadable(db, api):
    seed_source(db, "time1"); db.commit()
    body = {
        "workspaceId": "w1", "clientId": "c1", "timeEntryIds": ["time1"], "expenseIds": [],
        "currency": "USD", "periodStart": "2026-08-01", "periodEnd": "2026-08-11",
        "issueDate": "2026-08-12", "dueOn": "2026-09-11",
    }
    first = api.post("/api/tasklytic/billing/invoices:generate", json=body, headers={"Idempotency-Key": "invoice-1"})
    assert first.status_code == 200 and first.json()["replayed"] is False
    second = api.post("/api/tasklytic/billing/invoices:generate", json=body, headers={"Idempotency-Key": "invoice-1"})
    assert second.status_code == 200 and second.json()["replayed"] is True
    invoice = first.json()["invoice"]
    assert db.query(TasklyticEntityRecord).filter_by(entity_kind="invoices").count() == 1
    pdf = api.get(f"/api/tasklytic/billing/invoices/{invoice['id']}/pdf", params={"workspace_id": "w1"})
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF-1.4")


def test_summary_and_detailed_display_lines_reconcile_to_source_totals(db):
    seed_source(db, "time1", amount=200)
    seed_source(db, "expense1", kind="expenses", amount=50)
    invoice = generate(db, expenseIds=["expense1"], linePresentation="summary", taxAmount=12.5, discountAmount=10, discountReason="Courtesy")["invoice"]
    assert invoice["linePresentation"] == "summary"
    assert sum(line["amount"] for line in invoice["displayLines"]) == 250
    assert {line["description"] for line in invoice["displayLines"]} == {"Professional services", "Reimbursable expenses"}
    assert invoice["total"] == 252.5
    assert all(line["serviceDate"] == "2026-08-11" for line in invoice["lineItems"])
    assert all(line["matterProjectLabel"] == "Tax" for line in invoice["lineItems"])
    assert {line["sourceKind"] for line in invoice["lineItems"]} == {"timeEntries", "expenses"}


def test_submission_freezes_document_and_pdf_digest_against_later_changes(db):
    seed_source(db, "time1")
    client = db.query(TasklyticEntityRecord).filter_by(entity_kind="clients", record_id="c1").one()
    client.payload = {**client.payload, "contactName": "Zoë Client", "contactEmail": "billing@example.com", "billingAddress": "1 Rue de l'Été\nMontréal"}
    workspace = db.get(TasklyticWorkspace, "w1")
    workspace.payload = {**workspace.payload, "billingSettings": {
        **workspace.payload["billingSettings"], "issuerDisplayName": "Müller & Co.",
        "issuerAddress": "10 Königstraße", "accentColor": "#7C3AED",
        "paymentInstructions": "Wire using reference INV-1001", "pageSize": "a4",
        "defaultLinePresentation": "detailed", "taxLabel": "VAT",
    }}
    invoice = generate(db, narratives={"time1": "Résumé review - café engagement"})["invoice"]
    issued = invoice_action(db, invoice_id=invoice["id"], action="submit", workspace_id="w1", actor_id="owner", body={})["invoice"]
    first, digest = invoice_pdf(db, invoice_id=invoice["id"], workspace_id="w1", actor_id="owner")
    assert issued["documentSnapshot"]["version"] == 1
    assert issued["documentSnapshot"]["billTo"]["contactName"] == "Zoë Client"
    assert digest == issued["pdfSha256"]
    assert render_invoice_pdf(issued, workspace.payload, client=client.payload) == first

    workspace.payload = {**workspace.payload, "billingSettings": {**workspace.payload["billingSettings"], "issuerDisplayName": "Changed Firm", "accentColor": "#000000"}}
    client.payload = {**client.payload, "name": "Changed Client", "billingAddress": "Changed address"}
    second, second_digest = invoice_pdf(db, invoice_id=invoice["id"], workspace_id="w1", actor_id="owner")
    assert first == second and digest == second_digest
    assert render_invoice_pdf(issued, workspace.payload, client=client.payload) == first
    reader = PdfReader(io.BytesIO(first))
    assert tuple(round(float(value), 1) for value in reader.pages[0].mediabox[2:]) == (595.3, 841.9)
    with pdfplumber.open(io.BytesIO(first)) as pdf:
        extracted = "\n".join(page.extract_text() or "" for page in pdf.pages)
    assert "Müller & Co." in extracted and "Zoë Client" in extracted and "Résumé review" in extracted
    assert "Changed Firm" not in extracted and "DRAFT" not in extracted


def test_long_invoice_is_multipage_with_repeated_headers_and_deterministic_hash(db):
    ids = []
    for index in range(55):
        record_id = f"time{index}"
        ids.append(record_id)
        seed_source(db, record_id, amount=20 + index)
        row = db.query(TasklyticEntityRecord).filter_by(entity_kind="timeEntries", record_id=record_id).one()
        row.payload = {**row.payload, "description": f"Line {index + 1}: " + "Long professional services narrative " * 4}
    invoice = generate(db, timeEntryIds=ids, narratives={}, pageSize="letter", linePresentation="detailed")["invoice"]
    issued = invoice_action(db, invoice_id=invoice["id"], action="submit", workspace_id="w1", actor_id="owner", body={})["invoice"]
    content, digest = invoice_pdf(db, invoice_id=invoice["id"], workspace_id="w1", actor_id="owner")
    reader = PdfReader(io.BytesIO(content))
    assert len(reader.pages) >= 3
    assert tuple(float(value) for value in reader.pages[0].mediabox[2:]) == (612.0, 792.0)
    texts = [page.extract_text() or "" for page in reader.pages]
    assert all("Narrative" in text and "Amount" in text for text in texts)
    assert "Line 55" in "\n".join(texts)
    assert digest == issued["pdfSha256"]
    again, again_digest = invoice_pdf(db, invoice_id=invoice["id"], workspace_id="w1", actor_id="owner")
    assert content == again and digest == again_digest


def test_missing_branding_prevents_submission_without_advancing_status(db):
    seed_source(db, "time1")
    workspace = db.get(TasklyticWorkspace, "w1")
    workspace.payload = {**workspace.payload, "billingSettings": {**workspace.payload["billingSettings"], "logoObjectName": "tasklytic/w1/missing/logo.png"}}
    invoice = generate(db)["invoice"]
    with pytest.raises(HTTPException) as exc:
        invoice_action(db, invoice_id=invoice["id"], action="submit", workspace_id="w1", actor_id="owner", body={})
    assert exc.value.detail["code"] == "invoice_brand_unavailable"
    stored = db.query(TasklyticEntityRecord).filter_by(entity_kind="invoices", record_id=invoice["id"]).one().payload
    assert stored["status"] == "draft" and "documentSnapshot" not in stored


def test_email_delivery_attaches_frozen_pdf_and_transitions_after_provider_success(db, api, monkeypatch):
    monkeypatch.setattr(email_service, "send_html_email", lambda *_args, **_kwargs: True)
    seed_source(db, "time1")
    invoice = generate(db)["invoice"]
    invoice_action(db, invoice_id=invoice["id"], action="submit", workspace_id="w1", actor_id="owner", body={})
    invoice_action(db, invoice_id=invoice["id"], action="approve", workspace_id="w1", actor_id="approver", body={})
    db.commit()
    response = api.post(
        f"/api/tasklytic/billing/invoices/{invoice['id']}:send",
        headers={"Idempotency-Key": "email-1"},
        json={"workspaceId": "w1", "method": "email", "recipient": "client@example.com", "subject": "Invoice {invoiceNumber}", "message": "Attached invoice {invoiceNumber}."},
    )
    assert response.status_code == 200
    payload = response.json()
    command = db.query(TasklyticCommand).filter_by(command_type="maintenance.integration_email").one()
    assert payload["invoice"]["status"] == "sent", {"payload": payload, "failure": command.failure_detail}
    assert payload["invoice"]["deliveryHistory"][-1]["status"] == "sent"
    attachment = command.payload["attachments"][0]
    attached = base64.b64decode(attachment["contentBase64"])
    canonical, digest = invoice_pdf(db, invoice_id=invoice["id"], workspace_id="w1", actor_id="owner")
    assert attachment["mimeType"] == "application/pdf" and attached == canonical
    assert hashlib.sha256(attached).hexdigest() == digest


def test_failed_delivery_keeps_approved_invoice_unsent_and_is_idempotent(db):
    seed_source(db, "time1")
    invoice = generate(db)["invoice"]
    invoice_action(db, invoice_id=invoice["id"], action="submit", workspace_id="w1", actor_id="owner", body={})
    approved = invoice_action(db, invoice_id=invoice["id"], action="approve", workspace_id="w1", actor_id="approver", body={})["invoice"]
    queued = invoice_action(db, invoice_id=invoice["id"], action="send", workspace_id="w1", actor_id="billing", body={"method": "email", "recipient": "client@example.com"})["invoice"]
    delivery_id = queued["deliveryHistory"][-1]["id"]
    failed = finalize_invoice_delivery(db, invoice_id=invoice["id"], delivery_id=delivery_id, workspace_id="w1", actor_id="billing", delivery_status="failed", command_id="command-1", error="provider rejected message")
    replay = finalize_invoice_delivery(db, invoice_id=invoice["id"], delivery_id=delivery_id, workspace_id="w1", actor_id="billing", delivery_status="failed", command_id="command-1", error="provider rejected message")
    assert approved["status"] == failed["status"] == replay["status"] == "approved"
    assert failed.get("sentAt") is None
    assert failed["deliveryHistory"][-1]["status"] == "failed"


def test_invoice_brand_upload_rejects_svg_and_oversized_images(api):
    svg = api.post("/api/tasklytic/files:initiate", json={"workspace_id": "w1", "scope": "invoice_brand", "scope_id": "w1", "filename": "logo.svg", "content_type": "image/svg+xml", "size": 100})
    assert svg.status_code == 415
    oversized = api.post("/api/tasklytic/files:initiate", json={"workspace_id": "w1", "scope": "invoice_brand", "scope_id": "w1", "filename": "logo.png", "content_type": "image/png", "size": 2 * 1024 * 1024 + 1})
    assert oversized.status_code == 413

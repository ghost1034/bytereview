from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
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
)
from core.database import get_db
from dependencies.auth import verify_firebase_token
from routes.tasklytic import router as tasklytic_router
from services.tasklytic_billing import (
    create_fx_quote, generate_invoice, invoice_action, invoice_pdf,
    record_payment, record_trust_transaction, reverse_payment,
    reverse_trust_transaction,
)
from services.tasklytic_reporting import reporting_sources_payload
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
    sent = invoice_action(db, invoice_id=invoice["id"], action="send", workspace_id="w1", actor_id="billing", body={"method": "email", "recipient": "client@example.com"})["invoice"]
    assert approved["status"] == "approved" and sent["status"] == "sent"

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

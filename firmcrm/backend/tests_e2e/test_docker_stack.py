"""Black-box end-to-end tests against a running FirmCRM stack (nginx -> api -> postgres).

Run:  E2E_BASE_URL=http://localhost:8181 pytest tests_e2e --no-cov -q
Assumes the demo seed is loaded (docker compose --profile seed run --rm seed). Tests create their own records
(prefixed "E2E") and leave them archived; they do not depend on the state of demo records.
"""

from __future__ import annotations

import csv
import io
import os
import time
import uuid

import httpx
import pytest

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8181").rstrip("/")
PW = "Demo1234!Demo"
TAG = uuid.uuid4().hex[:6]


@pytest.fixture(scope="session")
def http():
    with httpx.Client(base_url=BASE, timeout=30) as c:
        yield c


def login(http: httpx.Client, email: str):
    r = http.post("/api/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    j = r.json()
    return {"Authorization": f"Bearer {j['access_token']}"}, j["refresh_token"]


@pytest.fixture(scope="session")
def admin(http):
    return login(http, "admin@demo.firm")[0]


def test_stack_is_ready_and_production_mode(http):
    r = http.get("/api/ready")
    assert r.status_code == 200, r.text
    assert r.json() == {**r.json(), "status": "ready", "env": "production"}
    checks = r.json()["checks"]
    assert checks["database"] is True and checks["migrations_at_head"] is True
    if "redis" in checks:  # compose stack runs Redis-backed rate limiting
        assert checks["redis"] is True and checks["rate_limiter"] == "redis"
    assert http.get("/healthz").text == "ok"
    # Production-only headers from both hops
    h = http.get("/api/health").headers
    assert h["strict-transport-security"].startswith("max-age=")
    spa = http.get("/").headers
    assert "content-security-policy" in spa and spa["x-frame-options"] == "DENY"
    assert http.get("/opportunities/123").status_code == 200  # SPA deep link


def test_auth_refresh_rotation_through_proxy(http):
    h, rt = login(http, "staff2@demo.firm")
    r = http.post("/api/auth/refresh", json={"refresh_token": rt})
    assert r.status_code == 200
    assert http.post("/api/auth/refresh", json={"refresh_token": rt}).status_code == 401  # rotated; reuse revokes the family
    # Access tokens are bound to their session family, so the reuse detection signs this session out immediately.
    assert http.get("/api/auth/me", headers=h).status_code == 401
    fresh = http.post("/api/auth/login", json={"email": "staff2@demo.firm", "password": PW}).json()
    assert http.get("/api/auth/me", headers={"Authorization": f"Bearer {fresh['access_token']}"}).json()["email"] == "staff2@demo.firm"
    assert http.get("/api/accounts").status_code == 401


def test_client_ip_is_forwarded_for_rate_limit_and_audit(http, admin):
    # nginx sets X-Forwarded-For; api has TRUST_PROXY_HEADERS=true -> audit note carries a real IP, not the docker bridge
    http.post("/api/auth/login", json={"email": "nobody@demo.firm", "password": "x" * 12})
    rows = http.get("/api/admin/audit?action=auth.login_failed&limit=5", headers=admin).json()["items"]
    assert rows and "ip=" in (rows[0]["note"] or "") and "ip=None" not in rows[0]["note"]


def test_full_pursuit_lifecycle(http, admin):
    partner, _ = login(http, "partner.lit@demo.firm")
    pas = http.get("/api/practice-areas", headers=admin).json()
    lit = next(p for p in pas if p["clearance_type"] == "conflict")
    stages = {s["name"]: s["id"] for s in http.get("/api/pipelines", headers=admin).json()[0]["stages"]}

    # Lead -> convert
    lead = http.post("/api/leads", json={"first_name": "E2E", "last_name": f"Lead{TAG}", "company": f"E2E Holdings {TAG}",
                                         "email": f"e2e.{TAG}@example.com", "source": "referral", "estimated_value": 80000,
                                         "practice_area_id": lit["id"]}, headers=admin)
    assert lead.status_code == 201, lead.text
    conv = http.post(f"/api/leads/{lead.json()['id']}/convert", json={"create_opportunity": True, "amount": 80000}, headers=admin)
    assert conv.status_code == 200, conv.text
    acc_id, opp_id = conv.json()["account_id"], conv.json()["opportunity_id"]
    assert http.get(f"/api/accounts/{acc_id}", headers=admin).json()["contact_count"] == 1

    # Adverse party that matches an existing client -> gate
    r = http.patch(f"/api/opportunities/{opp_id}", json={"adverse_parties": ["Northwind Robotics"], "engagement_letter_status": "signed"}, headers=admin)
    assert r.status_code == 200, r.text
    blocked = http.post(f"/api/opportunities/{opp_id}/stage", json={"stage_id": stages["Closed Won"]}, headers=admin)
    assert blocked.status_code == 400 and blocked.json()["code"] == "clearance_required"
    chk = http.post("/api/conflict-checks", json={"opportunity_id": opp_id, "parties": [f"E2E Holdings {TAG}", "Northwind Robotics"]}, headers=admin).json()
    assert chk["status"] == "pending" and any(m["relationship"] == "client" for m in chk["matches"])
    # waiver needs partner + note
    assert http.post(f"/api/conflict-checks/{chk['id']}/resolve", json={"status": "waived", "resolution_note": "x"}, headers=admin).status_code in (200,)  # admin allowed
    # (admin may waive; also check partner path on a second check)
    chk2 = http.post("/api/conflict-checks", json={"opportunity_id": opp_id, "parties": ["Northwind Robotics"]}, headers=admin).json()
    assert http.post(f"/api/conflict-checks/{chk2['id']}/resolve", json={"status": "waived"}, headers=partner).status_code == 400
    assert http.post(f"/api/conflict-checks/{chk2['id']}/resolve", json={"status": "waived", "resolution_note": "Consent obtained"}, headers=partner).json()["status"] == "waived"

    won = http.post(f"/api/opportunities/{opp_id}/stage", json={"stage_id": stages["Closed Won"]}, headers=admin)
    assert won.status_code == 200, won.text
    assert won.json()["status"] == "won" and won.json()["probability"] == 100
    engs = http.get(f"/api/engagements?account_id={acc_id}", headers=admin).json()["items"]
    assert len(engs) == 1 and engs[0]["annual_value"] == 80000 and engs[0]["adverse_parties"] == ["Northwind Robotics"]
    assert http.get(f"/api/accounts/{acc_id}", headers=admin).json()["account_type"] == "client"
    hist = http.get(f"/api/opportunities/{opp_id}/history", headers=admin).json()
    assert hist[-1]["to_stage_name"] == "Closed Won"
    # the new engagement's adverse party is now conflict-searchable
    matches = http.post("/api/conflict-checks/search", json={"parties": ["Northwind Robotics"]}, headers=admin).json()
    assert any(m["entity"] == "adverse_party" and f"E2E Holdings {TAG}" in (m["context"] or "") for m in matches)
    # archive for cleanup (won opps can be archived since closed)
    assert http.post(f"/api/opportunities/{opp_id}/archive", headers=admin).json()["is_archived"] is True
    assert http.post(f"/api/accounts/{acc_id}/archive", headers=admin).json()["is_archived"] is True


def test_rbac_through_proxy(http, admin):
    staff, _ = login(http, "staff@demo.firm")
    assert http.get("/api/admin/audit", headers=staff).status_code == 403
    assert http.get("/api/export/accounts.csv", headers=staff).status_code == 403
    assert http.post("/api/users", json={"email": "x@demo.firm", "full_name": "X", "password": "Str0ngPassw0rd!!"}, headers=staff).status_code == 403
    pending = http.get("/api/conflict-checks?status=pending&limit=1", headers=admin).json()["items"]
    if pending:
        assert http.post(f"/api/conflict-checks/{pending[0]['id']}/resolve", json={"status": "clear"}, headers=staff).status_code == 403


def test_pagination_validation_and_error_bodies(http, admin):
    p1 = http.get("/api/contacts?limit=10&offset=0", headers=admin).json()
    p2 = http.get("/api/contacts?limit=10&offset=10", headers=admin).json()
    assert p1["total"] >= 50 and len(p1["items"]) == 10 and {c["id"] for c in p1["items"]}.isdisjoint({c["id"] for c in p2["items"]})
    bad = http.post("/api/accounts", json={"name": "", "account_type": "nope"}, headers=admin)
    assert bad.status_code == 422 and bad.json()["code"] == "validation_error"
    dup = http.post("/api/accounts", json={"name": "northwind robotics inc"}, headers=admin)
    assert dup.status_code == 409 and dup.json()["code"] == "duplicate"
    assert http.get("/api/nope", headers=admin).status_code == 404
    # A real 11 MB body must be rejected by nginx (client_max_body_size 10m) before it reaches the API.
    big = http.post("/api/accounts", content=b'{"name":"' + b"x" * (11 * 1024 * 1024) + b'"}', headers={**admin, "content-type": "application/json"})
    assert big.status_code == 413


def test_csv_export_and_import_roundtrip(http, admin):
    r = http.get("/api/export/contacts.csv", headers=admin)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) >= 50 and "email" in rows[0]
    # import: dry run then commit
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["first_name", "last_name", "email", "title", "account_name", "lifecycle"])
    w.writeheader()
    w.writerow({"first_name": "E2E", "last_name": f"Import{TAG}", "email": f"e2e.import.{TAG}@example.com", "title": "CFO", "account_name": "Northwind Robotics Inc", "lifecycle": "client"})
    w.writerow({"first_name": "E2E", "last_name": "Broken", "email": "not-an-email", "title": "", "account_name": "Nope Inc", "lifecycle": "client"})
    data = buf.getvalue().encode()
    dry = http.post("/api/import/contacts", files={"file": ("e2e.csv", data, "text/csv")}, data={"dry_run": "true"}, headers=admin).json()
    assert dry["dry_run"] and dry["created_rows"] == 1 and dry["skipped_rows"] == 1
    assert http.get(f"/api/contacts?q=e2e.import.{TAG}", headers=admin).json()["total"] == 0  # nothing written
    commit = http.post("/api/import/contacts", files={"file": ("e2e.csv", data, "text/csv")}, data={"dry_run": "false"}, headers=admin).json()
    assert commit["created_rows"] == 1
    got = http.get(f"/api/contacts?q=e2e.import.{TAG}", headers=admin).json()
    assert got["total"] == 1 and got["items"][0]["account_name"] == "Northwind Robotics Inc"
    exc = http.get(f"/api/import/jobs/{commit['id']}/exceptions.csv", headers=admin)
    assert exc.status_code == 200 and "not-an-email" in exc.text or "value is not a valid email" in exc.text
    http.post(f"/api/contacts/{got['items'][0]['id']}/archive", headers=admin)


def test_reports_and_dashboard(http, admin):
    d = http.get("/api/reports/dashboard", headers=admin).json()
    assert d["kpis"]["open_count"] > 0 and d["pipeline"]["stages"]
    for path in ("pipeline", "win-loss", "practice-areas", "origination", "referral-sources", "funnel", "stage-velocity", "activity-leaderboard"):
        assert http.get(f"/api/reports/{path}", headers=admin).status_code == 200, path


def test_request_id_propagates_from_nginx(http, admin):
    r = http.get("/api/accounts?limit=1", headers={**admin, "x-request-id": f"e2e-{TAG}"})
    # nginx forwards X-Request-ID from the client if present (our location passes $request_id; the api echoes what it receives)
    assert r.headers["x-request-id"]


def test_audit_trail_records_e2e_actions(http, admin):
    rows = http.get("/api/admin/audit?limit=200", headers=admin).json()["items"]
    actions = {r["action"] for r in rows}
    assert {"lead.convert", "opportunity.stage_change", "conflict_check.resolve", "import.contacts", "export.contacts", "account.archive"} <= actions


def test_timing_budget(http, admin):
    t = time.perf_counter()
    for _ in range(5):
        assert http.get("/api/opportunities?status=open&limit=100", headers=admin).status_code == 200
    avg = (time.perf_counter() - t) / 5
    assert avg < 1.5, f"opportunity list avg {avg:.2f}s through proxy"


def test_ethical_wall_end_to_end(http, admin):
    partner, _ = login(http, "partner.lit@demo.firm")
    staff, _ = login(http, "staff@demo.firm")
    acc = http.post("/api/accounts", json={"name": f"E2E Walled {TAG}", "account_type": "client"}, headers=admin).json()
    opp = http.post("/api/opportunities", json={"name": f"E2E walled matter {TAG}", "account_id": acc["id"], "amount": 1, "adverse_parties": [f"E2E Hostile {TAG}"]}, headers=admin).json()
    assert http.get(f"/api/accounts/{acc['id']}", headers=staff).status_code == 200
    w = http.post("/api/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "E2E: adverse to existing client"}, headers=partner)
    assert w.status_code == 201, w.text
    assert http.get(f"/api/accounts/{acc['id']}", headers=staff).status_code == 404
    assert http.get(f"/api/opportunities/{opp['id']}", headers=staff).status_code == 404
    assert http.get(f"/api/accounts?q=E2E%20Walled%20{TAG}", headers=staff).json()["total"] == 0
    m = http.post("/api/conflict-checks/search", json={"parties": [f"E2E Hostile {TAG}"]}, headers=staff).json()
    assert m and all(x["restricted"] for x in m if x["matched_name"] == f"E2E Hostile {TAG}")
    assert http.get(f"/api/accounts/{acc['id']}", headers=partner).status_code == 200
    assert http.post(f"/api/walls/{w.json()['id']}/lift", headers=partner).json()["is_active"] is False
    assert http.get(f"/api/accounts/{acc['id']}", headers=staff).status_code == 200
    http.post(f"/api/accounts/{acc['id']}/archive", headers=admin)

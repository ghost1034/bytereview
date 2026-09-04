"""Regression tests for the functional QA round (design/reviews/flows.md)."""

import csv
import io

from .conftest import login


def _stages(client, h):
    return {s["name"]: s["id"] for s in client.get("/api/firmcrm/pipelines", headers=h).json()[0]["stages"]}


def _won_opp(client, admin, name):
    acc = client.post("/api/firmcrm/accounts", json={"name": name}, headers=admin).json()
    opp = client.post("/api/firmcrm/opportunities", json={"name": f"{name} matter", "account_id": acc["id"], "amount": 50000, "engagement_letter_status": "signed"}, headers=admin).json()
    st = _stages(client, admin)
    r = client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": st["Closed Won"]}, headers=admin)
    assert r.status_code == 200, r.text
    return acc, opp, st


def test_rewin_after_reopen_reuses_engagement(client, admin):
    acc, opp, st = _won_opp(client, admin, "Rewin Co")
    engs = lambda: client.get(f"/api/firmcrm/engagements?account_id={acc['id']}", headers=admin).json()["items"]  # noqa: E731
    assert len(engs()) == 1
    assert client.post(f"/api/firmcrm/opportunities/{opp['id']}/reopen", json={"stage_id": st["Negotiation"]}, headers=admin).status_code == 200
    assert engs()[0]["status"] == "on_hold"
    # account no longer a client while nothing is won
    assert client.get(f"/api/firmcrm/accounts/{acc['id']}", headers=admin).json()["account_type"] == "prospect"
    client.patch(f"/api/firmcrm/opportunities/{opp['id']}", json={"amount": 60000}, headers=admin)
    assert client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": st["Closed Won"]}, headers=admin).status_code == 200
    e = engs()
    assert len(e) == 1 and e[0]["status"] == "active" and e[0]["annual_value"] == 60000
    assert client.get(f"/api/firmcrm/accounts/{acc['id']}", headers=admin).json()["account_type"] == "client"
    audit = {a["action"] for a in client.get(f"/api/firmcrm/admin/audit?entity_type=engagement&entity_id={e[0]['id']}", headers=admin).json()["items"]}
    assert {"engagement.create", "engagement.on_hold", "engagement.reactivate"} <= audit


def test_lost_after_win_terminates_engagement_and_reverts_client(client, admin):
    acc, opp, st = _won_opp(client, admin, "Lost After Win Co")
    assert client.post(f"/api/firmcrm/opportunities/{opp['id']}/reopen", json={"stage_id": st["Proposal"]}, headers=admin).status_code == 200
    r = client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": st["Closed Lost"], "lost_reason": "price"}, headers=admin)
    assert r.status_code == 200
    e = client.get(f"/api/firmcrm/engagements?account_id={acc['id']}", headers=admin).json()["items"]
    assert len(e) == 1 and e[0]["status"] == "terminated" and e[0]["end_date"]
    a = client.get(f"/api/firmcrm/accounts/{acc['id']}", headers=admin).json()
    assert a["account_type"] == "prospect" and a["client_since"] is None
    audit = {x["action"] for x in client.get(f"/api/firmcrm/admin/audit?entity_type=account&entity_id={acc['id']}", headers=admin).json()["items"]}
    assert {"account.became_client", "account.client_status_reverted"} <= audit


def test_client_status_kept_when_other_won_work_exists(client, admin):
    acc, opp1, st = _won_opp(client, admin, "Two Matters Co")
    opp2 = client.post("/api/firmcrm/opportunities", json={"name": "Second matter", "account_id": acc["id"], "amount": 1000, "engagement_letter_status": "signed"}, headers=admin).json()
    assert client.post(f"/api/firmcrm/opportunities/{opp2['id']}/stage", json={"stage_id": st["Closed Won"]}, headers=admin).status_code == 200
    client.post(f"/api/firmcrm/opportunities/{opp1['id']}/reopen", json={"stage_id": st["Proposal"]}, headers=admin)
    client.post(f"/api/firmcrm/opportunities/{opp1['id']}/stage", json={"stage_id": st["Closed Lost"], "lost_reason": "timing"}, headers=admin)
    assert client.get(f"/api/firmcrm/accounts/{acc['id']}", headers=admin).json()["account_type"] == "client"


def test_reopen_refuses_open_opportunity(client, admin):
    opp = client.get("/api/firmcrm/opportunities?status=open&limit=1", headers=admin).json()["items"][0]
    r = client.post(f"/api/firmcrm/opportunities/{opp['id']}/reopen", json={"stage_id": opp["stage_id"]}, headers=admin)
    assert r.status_code == 400 and r.json()["code"] == "not_closed"


def test_lost_reason_is_an_enum(client, admin):
    opp = client.get("/api/firmcrm/opportunities?status=open&limit=1", headers=admin).json()["items"][0]
    st = _stages(client, admin)
    assert client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": st["Closed Lost"], "lost_reason": "made-up"}, headers=admin).status_code == 422


def test_resolved_checks_are_final_for_managers_and_overrides_are_audited(client, admin):
    mgr = login(client, "manager@demo.firm")
    partner = login(client, "partner.lit@demo.firm")
    acc = client.post("/api/firmcrm/accounts", json={"name": "Final Decision Co"}, headers=admin).json()
    opp = client.post("/api/firmcrm/opportunities", json={"name": "x", "account_id": acc["id"], "adverse_parties": ["Northwind Robotics"]}, headers=admin).json()
    chk = client.post("/api/firmcrm/conflict-checks", json={"opportunity_id": opp["id"], "parties": ["Northwind Robotics"]}, headers=admin).json()
    assert chk["status"] == "pending"
    assert client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "waived", "resolution_note": "Consent on file"}, headers=partner).json()["status"] == "waived"
    # manager cannot overturn a partner waiver
    r = client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "conflict", "resolution_note": "changed my mind"}, headers=mgr)
    assert r.status_code == 403 and r.json()["code"] == "already_resolved"
    # partner override requires a note and is recorded as an override with the prior decision retained
    assert client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "conflict"}, headers=partner).json()["code"] == "override_note_required"
    assert client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "conflict", "resolution_note": "New information"}, headers=partner).json()["status"] == "conflict"
    audit = client.get(f"/api/firmcrm/admin/audit?entity_type=conflict_check&entity_id={chk['id']}", headers=admin).json()["items"]
    ov = next(a for a in audit if a["action"] == "conflict_check.override")
    assert "waived" in ov["before_json"] and "Consent on file" in ov["before_json"]


def test_wall_self_lockout_guard(client, admin):
    partner = login(client, "partner.corp@demo.firm")
    users = client.get("/api/firmcrm/users", headers=admin).json()
    staff_id = next(u["id"] for u in users if u["email"] == "staff@demo.firm")
    admin_id = next(u["id"] for u in users if u["email"] == "admin@demo.firm")
    acc = client.post("/api/firmcrm/accounts", json={"name": "Lockout Co"}, headers=admin).json()
    w = client.post("/api/firmcrm/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "self-lockout test", "member_ids": [staff_id]}, headers=partner).json()
    me = next(m["user_id"] for m in w["members"] if m["role"] == "partner")
    r = client.delete(f"/api/firmcrm/walls/{w['id']}/members/{me}", headers=partner)
    assert r.status_code == 400 and r.json()["code"] == "self_lockout"
    # with another partner/admin inside, self-removal is allowed
    client.post(f"/api/firmcrm/walls/{w['id']}/members", json={"user_id": admin_id}, headers=partner)
    assert client.delete(f"/api/firmcrm/walls/{w['id']}/members/{me}", headers=partner).status_code == 200
    client.post(f"/api/firmcrm/walls/{w['id']}/lift", headers=admin)


def test_lead_archive_requires_manager(client, admin):
    staff = login(client, "staff@demo.firm")
    lead = client.post("/api/firmcrm/leads", json={"first_name": "Arch", "last_name": "Ive"}, headers=admin).json()
    assert client.post(f"/api/firmcrm/leads/{lead['id']}/archive", headers=staff).status_code == 403
    assert client.post(f"/api/firmcrm/leads/{lead['id']}/archive", headers=login(client, "manager@demo.firm")).status_code == 200


def test_inactive_practice_area_not_usable(client, admin):
    pa = client.post("/api/firmcrm/practice-areas", json={"name": "Retired Area", "discipline": "advisory", "is_active": False}, headers=admin).json()
    assert pa["id"] not in {p["id"] for p in client.get("/api/firmcrm/practice-areas?active_only=true", headers=admin).json()}
    assert pa["id"] in {p["id"] for p in client.get("/api/firmcrm/practice-areas", headers=admin).json()}
    acc = client.get("/api/firmcrm/accounts?limit=1", headers=admin).json()["items"][0]
    r = client.post("/api/firmcrm/opportunities", json={"name": "x", "account_id": acc["id"], "practice_area_id": pa["id"]}, headers=admin)
    assert r.status_code == 400 and r.json()["code"] == "inactive_practice_area"
    assert client.post("/api/firmcrm/leads", json={"first_name": "A", "last_name": "B", "practice_area_id": pa["id"]}, headers=admin).json()["code"] == "inactive_practice_area"


def test_server_side_sort_across_pages(client, admin):
    p1 = client.get("/api/firmcrm/accounts?sort=open_pipeline&dir=desc&limit=5&offset=0", headers=admin).json()["items"]
    p2 = client.get("/api/firmcrm/accounts?sort=open_pipeline&dir=desc&limit=5&offset=5", headers=admin).json()["items"]
    vals = [a["open_pipeline"] for a in p1 + p2]
    assert vals == sorted(vals, reverse=True) and vals[0] > 0
    names = [c["last_name"] for c in client.get("/api/firmcrm/contacts?sort=last_name&dir=asc&limit=20", headers=admin).json()["items"]]
    assert names == sorted(names)
    assert client.get("/api/firmcrm/accounts?sort=password_hash", headers=admin).status_code == 422
    assert client.get("/api/firmcrm/opportunities?sort=amount&dir=desc&limit=3", headers=admin).status_code == 200
    assert client.get("/api/firmcrm/leads?sort=score&dir=desc", headers=admin).status_code == 200
    assert client.get("/api/firmcrm/engagements?sort=annual_value&dir=desc", headers=admin).status_code == 200
    assert client.get("/api/firmcrm/campaigns?sort=budget", headers=admin).status_code == 200


def test_engagement_create_validates_account(client, admin):
    assert client.post("/api/firmcrm/engagements", json={"name": "x", "account_id": 999999}, headers=admin).status_code == 404


def test_import_resolver_errors_include_row_context(client, admin):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["first_name", "last_name", "email", "account_name"])
    w.writeheader()
    w.writerow({"first_name": "Ctx", "last_name": "Row", "email": "ctx.row@example.com", "account_name": "No Such Account Ltd"})
    job = client.post("/api/firmcrm/import/contacts", files={"file": ("c.csv", buf.getvalue().encode(), "text/csv")}, data={"dry_run": "true"}, headers=admin).json()
    exc = next(e for e in job["exceptions"] if e["field"] == "account_name")
    assert exc["data"].get("email") == "ctx.row@example.com"

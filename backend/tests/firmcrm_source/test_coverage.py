"""Router-by-router behaviour and RBAC coverage beyond the core flows."""

from .conftest import login




def test_reference_data_admin_crud(client, admin):
    mgr = login(client, "manager@demo.firm")
    assert client.post("/api/firmcrm/practice-areas", json={"name": "Tax Controversy", "discipline": "legal"}, headers=mgr).status_code == 403
    r = client.post("/api/firmcrm/practice-areas", json={"name": "Tax Controversy", "discipline": "legal", "clearance_type": "conflict"}, headers=admin)
    assert r.status_code == 201
    pa = r.json()
    r = client.patch(f"/api/firmcrm/practice-areas/{pa['id']}", json={"name": "Tax Controversy & Litigation", "discipline": "legal", "clearance_type": None, "is_active": True}, headers=admin)
    assert r.status_code == 200 and r.json()["clearance_type"] is None
    assert client.post("/api/firmcrm/practice-areas", json={"name": "Bad", "discipline": "astrology"}, headers=admin).status_code == 422
    # pipelines: validation rules
    bad = {"name": "Broken", "stages": [{"name": "Only", "position": 0}]}
    assert client.post("/api/firmcrm/pipelines", json=bad, headers=admin).status_code == 400
    good = {"name": "Referral Fast Track", "stages": [{"name": "In", "position": 0, "probability": 20}, {"name": "Won", "position": 1, "probability": 100, "is_won": True}, {"name": "Lost", "position": 2, "probability": 0, "is_lost": True}]}
    r = client.post("/api/firmcrm/pipelines", json=good, headers=admin)
    assert r.status_code == 201 and len(r.json()["stages"]) == 3
    pid = r.json()["id"]
    st = client.post(f"/api/firmcrm/pipelines/{pid}/stages", json={"name": "Proposal", "position": 1, "probability": 60}, headers=admin).json()
    assert client.patch(f"/api/firmcrm/stages/{st['id']}", json={"name": "Proposal sent", "position": 1, "probability": 65, "is_won": False, "is_lost": False}, headers=admin).json()["probability"] == 65
    assert client.delete(f"/api/firmcrm/stages/{st['id']}", headers=admin).status_code == 204
    # cannot delete a stage that has opportunities
    default = client.get("/api/firmcrm/pipelines", headers=admin).json()[0]
    used = client.get("/api/firmcrm/opportunities?status=open&limit=1", headers=admin).json()["items"][0]["stage_id"]
    assert default["is_default"]
    assert client.delete(f"/api/firmcrm/stages/{used}", headers=admin).json()["code"] == "stage_in_use"


def test_lead_convert_into_existing_account_and_unqualified_rules(client, admin):
    acc = client.get("/api/firmcrm/accounts?q=Halcyon", headers=admin).json()["items"][0]
    lead = client.post("/api/firmcrm/leads", json={"first_name": "Existing", "last_name": "Acct", "company": "Halcyon Health", "email": "exist@halcyon.example.com"}, headers=admin).json()
    r = client.post(f"/api/firmcrm/leads/{lead['id']}/convert", json={"existing_account_id": acc["id"], "create_opportunity": False}, headers=admin)
    assert r.status_code == 200 and r.json()["account_id"] == acc["id"] and r.json()["opportunity_id"] is None
    assert client.patch(f"/api/firmcrm/leads/{lead['id']}", json={"title": "x"}, headers=admin).json()["code"] == "converted"
    assert client.delete(f"/api/firmcrm/leads/{lead['id']}", headers=admin).json()["code"] == "converted"
    lead2 = client.post("/api/firmcrm/leads", json={"first_name": "No", "last_name": "Budget"}, headers=admin).json()
    assert client.patch(f"/api/firmcrm/leads/{lead2['id']}", json={"status": "unqualified"}, headers=admin).json()["code"] == "unqualified_reason"
    assert client.patch(f"/api/firmcrm/leads/{lead2['id']}", json={"status": "unqualified", "unqualified_reason": "Below minimum fee"}, headers=admin).status_code == 200
    assert client.post(f"/api/firmcrm/leads/{lead2['id']}/convert", json={}, headers=admin).json()["code"] == "unqualified"
    assert client.post(f"/api/firmcrm/leads/{lead2['id']}/convert", json={"existing_account_id": 999999}, headers=admin).status_code == 400
    assert client.get("/api/firmcrm/leads?status=converted", headers=admin).json()["total"] >= 1
    assert client.get(f"/api/firmcrm/leads/{lead2['id']}", headers=admin).json()["status"] == "unqualified"
    assert client.post(f"/api/firmcrm/leads/{lead2['id']}/archive", headers=admin).json()["is_archived"] is True
    assert client.post(f"/api/firmcrm/leads/{lead2['id']}/restore", headers=admin).json()["is_archived"] is False
    assert client.delete(f"/api/firmcrm/leads/{lead2['id']}", headers=admin).status_code == 204


def test_opportunity_lifecycle_reopen_history_and_rbac(client, admin):
    staff = login(client, "staff@demo.firm")
    pipe = client.get("/api/firmcrm/pipelines", headers=admin).json()[0]
    stages = {s["name"]: s["id"] for s in pipe["stages"]}
    acc = client.post("/api/firmcrm/accounts", json={"name": "Lifecycle Co"}, headers=staff).json()
    o = client.post("/api/firmcrm/opportunities", json={"name": "Lifecycle deal", "account_id": acc["id"], "amount": 20000, "expected_close": "2026-12-31"}, headers=staff).json()
    assert o["owner_name"] == "Aisha Bello" and o["probability"] == 10
    # invalid initial stage
    assert client.post("/api/firmcrm/opportunities", json={"name": "x", "account_id": acc["id"], "stage_id": stages["Closed Won"]}, headers=staff).status_code == 400
    assert client.post("/api/firmcrm/opportunities", json={"name": "x", "account_id": 999999}, headers=staff).status_code == 404
    # move forward, then lost
    assert client.post(f"/api/firmcrm/opportunities/{o['id']}/stage", json={"stage_id": stages["Proposal"]}, headers=staff).json()["probability"] == 60
    assert client.post(f"/api/firmcrm/opportunities/{o['id']}/stage", json={"stage_id": 999999}, headers=staff).status_code == 404
    r = client.post(f"/api/firmcrm/opportunities/{o['id']}/stage", json={"stage_id": stages["Closed Lost"], "lost_reason": "price", "competitor": "BigFour LLP"}, headers=staff)
    assert r.json()["status"] == "lost" and r.json()["competitor"] == "BigFour LLP"
    # closed: cannot change stage; staff cannot reopen; manager can
    assert client.post(f"/api/firmcrm/opportunities/{o['id']}/stage", json={"stage_id": stages["Qualified"]}, headers=staff).json()["code"] == "closed"
    assert client.post(f"/api/firmcrm/opportunities/{o['id']}/reopen", json={"stage_id": stages["Qualified"]}, headers=staff).status_code == 403
    assert client.post(f"/api/firmcrm/opportunities/{o['id']}/reopen", json={"stage_id": stages["Closed Won"]}, headers=admin).status_code == 400
    r = client.post(f"/api/firmcrm/opportunities/{o['id']}/reopen", json={"stage_id": stages["Qualified"]}, headers=admin)
    assert r.json()["status"] == "open" and r.json()["lost_reason"] is None
    hist = client.get(f"/api/firmcrm/opportunities/{o['id']}/history", headers=staff).json()
    assert [h["to_stage_name"] for h in hist] == ["Identified", "Proposal", "Closed Lost", "Qualified"]
    # filters
    assert client.get(f"/api/firmcrm/opportunities?account_id={acc['id']}&status=all", headers=staff).json()["total"] == 1
    assert client.get("/api/firmcrm/opportunities?status=bogus", headers=staff).status_code == 422
    assert client.get("/api/firmcrm/opportunities?stale_only=true", headers=staff).status_code == 200
    assert client.get("/api/firmcrm/opportunities?q=Lifecycle", headers=staff).json()["total"] == 1
    # delete rules: staff cannot, admin can (not won)
    assert client.delete(f"/api/firmcrm/opportunities/{o['id']}", headers=staff).status_code == 403
    assert client.delete(f"/api/firmcrm/opportunities/{o['id']}", headers=admin).status_code == 204
    assert client.get(f"/api/firmcrm/opportunities/{o['id']}", headers=admin).status_code == 404


def test_activities_rules(client, admin):
    staff = login(client, "staff@demo.firm")
    mkt = login(client, "marketing@demo.firm")
    acc = client.get("/api/firmcrm/accounts?limit=1", headers=admin).json()["items"][0]
    contact = client.get(f"/api/firmcrm/contacts?account_id={acc['id']}&limit=1", headers=admin).json()["items"][0]
    # must relate to something
    assert client.post("/api/firmcrm/activities", json={"kind": "note", "subject": "orphan"}, headers=staff).status_code == 400
    # contact-only activity auto-links account
    a = client.post("/api/firmcrm/activities", json={"kind": "task", "subject": "Call back", "contact_id": contact["id"], "due_at": "2026-09-01T10:00:00", "priority": "high"}, headers=staff).json()
    assert a["account_id"] == acc["id"] and a["owner_name"] == "Aisha Bello"
    # complete / reopen
    assert client.patch(f"/api/firmcrm/activities/{a['id']}", json={"completed": True}, headers=staff).json()["completed_at"]
    assert client.patch(f"/api/firmcrm/activities/{a['id']}", json={"completed": False, "subject": "Call back (rescheduled)"}, headers=staff).json()["completed_at"] is None
    # open task listing and ownership scoping
    mine = client.get("/api/firmcrm/activities?open_tasks=true&mine=true", headers=staff).json()["items"]
    assert any(t["id"] == a["id"] for t in mine)
    assert client.get(f"/api/firmcrm/activities?contact_id={contact['id']}&kind=task", headers=staff).json()["total"] >= 1
    assert client.get("/api/firmcrm/activities?kind=telepathy", headers=staff).status_code == 422
    # only owner or manager+ can delete
    assert client.delete(f"/api/firmcrm/activities/{a['id']}", headers=mkt).status_code == 403
    assert client.delete(f"/api/firmcrm/activities/{a['id']}", headers=staff).status_code == 204
    assert client.delete(f"/api/firmcrm/activities/{a['id']}", headers=admin).status_code == 404


def test_campaigns_and_members(client, admin):
    staff = login(client, "staff@demo.firm")
    c = client.post("/api/firmcrm/campaigns", json={"name": "Coverage Webinar", "kind": "webinar", "budget": 1000}, headers=staff).json()
    assert c["owner_id"] and c["member_count"] == 0
    assert client.patch(f"/api/firmcrm/campaigns/{c['id']}", json={"status": "active", "actual_cost": 250}, headers=staff).json()["status"] == "active"
    assert client.patch(f"/api/firmcrm/campaigns/{c['id']}", json={"status": "cancelled"}, headers=staff).status_code == 422
    contacts = client.get("/api/firmcrm/contacts?limit=2", headers=staff).json()["items"]
    m = client.post(f"/api/firmcrm/campaigns/{c['id']}/members", json={"contact_id": contacts[0]["id"]}, headers=staff).json()
    assert client.post(f"/api/firmcrm/campaigns/{c['id']}/members", json={"contact_id": contacts[0]["id"]}, headers=staff).status_code == 409
    assert client.post(f"/api/firmcrm/campaigns/{c['id']}/members", json={"contact_id": 999999}, headers=staff).status_code == 404
    client.post(f"/api/firmcrm/campaigns/{c['id']}/members", json={"contact_id": contacts[1]["id"], "status": "attended"}, headers=staff)
    assert client.patch(f"/api/firmcrm/campaigns/{c['id']}/members/{m['id']}", json={"contact_id": contacts[0]["id"], "status": "attended"}, headers=staff).json()["status"] == "attended"
    got = client.get(f"/api/firmcrm/campaigns/{c['id']}", headers=staff).json()
    assert got["member_count"] == 2 and got["attended_count"] == 2
    members = client.get(f"/api/firmcrm/campaigns/{c['id']}/members", headers=staff).json()
    assert len(members) == 2 and members[0]["contact_name"]
    assert client.delete(f"/api/firmcrm/campaigns/{c['id']}/members/{m['id']}", headers=staff).status_code == 204
    assert client.get("/api/firmcrm/campaigns?status=active", headers=staff).json()["total"] >= 1
    assert client.post(f"/api/firmcrm/campaigns/{c['id']}/archive", headers=staff).status_code == 403
    assert client.post(f"/api/firmcrm/campaigns/{c['id']}/archive", headers=admin).json()["is_archived"] is True
    assert c["id"] not in {x["id"] for x in client.get("/api/firmcrm/campaigns?limit=500", headers=admin).json()["items"]}
    assert client.post(f"/api/firmcrm/campaigns/{c['id']}/restore", headers=admin).json()["is_archived"] is False


def test_engagements_crud_rbac(client, admin):
    staff = login(client, "staff@demo.firm")
    acc = client.get("/api/firmcrm/accounts?account_type=client&limit=1", headers=admin).json()["items"][0]
    assert client.post("/api/firmcrm/engagements", json={"name": "Manual", "account_id": acc["id"]}, headers=staff).status_code == 403
    e = client.post("/api/firmcrm/engagements", json={"name": "Manual engagement", "account_id": acc["id"], "annual_value": 12000, "external_ref": "PSA-1"}, headers=admin).json()
    assert client.patch(f"/api/firmcrm/engagements/{e['id']}", json={"status": "completed", "end_date": "2026-12-31"}, headers=admin).json()["status"] == "completed"
    assert client.patch(f"/api/firmcrm/engagements/{e['id']}", json={"status": "paused"}, headers=admin).status_code == 422
    assert client.get("/api/firmcrm/engagements?status=completed", headers=staff).json()["total"] >= 1
    assert client.patch("/api/firmcrm/engagements/999999", json={"status": "active"}, headers=admin).status_code == 404


def test_conflict_check_edge_cases(client, admin):
    staff = login(client, "staff@demo.firm")
    mgr = login(client, "manager@demo.firm")
    assert client.post("/api/firmcrm/conflict-checks", json={"parties": ["X"]}, headers=staff).status_code == 400
    assert client.post("/api/firmcrm/conflict-checks", json={"check_type": "astrology", "account_id": 1, "parties": ["X"]}, headers=staff).status_code == 422
    acc = client.post("/api/firmcrm/accounts", json={"name": "Clean Slate Ventures"}, headers=staff).json()
    # no matches -> auto-clear
    r = client.post("/api/firmcrm/conflict-checks", json={"account_id": acc["id"], "parties": ["Clean Slate Ventures", "Zyxwv Nonexistent Corp"]}, headers=staff)
    assert r.json()["status"] == "clear" and r.json()["resolved_by_id"]
    # independence with disclosure -> pending even without matches
    audit_pa = next(p for p in client.get("/api/firmcrm/practice-areas", headers=staff).json() if p["clearance_type"] == "independence")
    opp = client.post("/api/firmcrm/opportunities", json={"name": "Indep test", "account_id": acc["id"], "practice_area_id": audit_pa["id"], "amount": 1}, headers=staff).json()
    r = client.post("/api/firmcrm/conflict-checks", json={"check_type": "independence", "opportunity_id": opp["id"], "parties": ["Clean Slate Ventures"],
                                                  "independence_attestation": {"financial_interest": True}}, headers=staff)
    chk = r.json()
    assert chk["status"] == "pending" and chk["check_type"] == "independence"
    # staff cannot resolve; a disclosed independence relationship requires a partner (manager is refused); partner records conflict
    assert client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "clear"}, headers=staff).status_code == 403
    r = client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "conflict", "resolution_note": "x"}, headers=mgr)
    assert r.status_code == 403 and r.json()["code"] == "partner_required"
    partner = login(client, "partner.audit@demo.firm")
    assert client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "conflict", "resolution_note": "Covered person holds shares"}, headers=partner).json()["status"] == "conflict"
    assert client.get(f"/api/firmcrm/conflict-checks/{chk['id']}", headers=staff).json()["opportunity_name"] == "Indep test"
    assert client.get("/api/firmcrm/conflict-checks?check_type=independence&status=conflict", headers=staff).json()["total"] >= 1
    assert client.get(f"/api/firmcrm/opportunities/{opp['id']}", headers=staff).json()["clearance_status"] == "conflict"


def test_reports_filters(client, admin):
    pipe = client.get("/api/firmcrm/pipelines", headers=admin).json()[0]
    assert client.get(f"/api/firmcrm/reports/pipeline?pipeline_id={pipe['id']}", headers=admin).json()["total_count"] >= 1
    wl = client.get("/api/firmcrm/reports/win-loss?months=3", headers=admin).json()
    assert "win_rate" in wl and isinstance(wl["monthly"], list)
    funnel = client.get("/api/firmcrm/reports/funnel?months=24", headers=admin).json()
    assert funnel["leads"] >= funnel["converted"]
    lb = client.get("/api/firmcrm/reports/activity-leaderboard?days=365", headers=admin).json()
    assert lb and lb[0]["total"] >= lb[-1]["total"]


def test_account_and_contact_detail_enrichment(client, admin):
    acc = client.get("/api/firmcrm/accounts?q=Northwind", headers=admin).json()["items"][0]
    got = client.get(f"/api/firmcrm/accounts/{acc['id']}", headers=admin).json()
    assert got["contact_count"] >= 3 and got["owner_name"] and got["engagement_count"] >= 0
    assert client.get("/api/firmcrm/accounts/999999", headers=admin).status_code == 404
    r = client.patch(f"/api/firmcrm/accounts/{acc['id']}", json={"risk_rating": "medium", "tags": ["manufacturing", "key-account"]}, headers=admin)
    assert r.json()["tags"] == ["manufacturing", "key-account"]
    assert client.patch(f"/api/firmcrm/accounts/{acc['id']}", json={"risk_rating": "extreme"}, headers=admin).status_code == 422
    c = client.get(f"/api/firmcrm/contacts?account_id={acc['id']}&limit=1", headers=admin).json()["items"][0]
    assert client.get(f"/api/firmcrm/contacts/{c['id']}", headers=admin).json()["account_name"] == acc["name"]
    assert client.patch(f"/api/firmcrm/contacts/{c['id']}", json={"role": "champion", "do_not_contact": True}, headers=admin).json()["do_not_contact"] is True
    assert client.get("/api/firmcrm/contacts?role=champion", headers=admin).json()["total"] >= 1
    staff = login(client, "staff@demo.firm")
    assert client.delete(f"/api/firmcrm/contacts/{c['id']}", headers=staff).status_code == 403

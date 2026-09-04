from .conftest import login




def test_lead_convert_creates_account_contact_opportunity(client, admin):
    r = client.post("/api/firmcrm/leads", json={"first_name": "Ada", "last_name": "Lovelace", "company": "Analytical Engines Ltd",
                                         "email": "ada@ae.example.com", "source": "referral", "estimated_value": 50000}, headers=admin)
    assert r.status_code == 201
    lead_id = r.json()["id"]
    r = client.post(f"/api/firmcrm/leads/{lead_id}/convert", json={"create_opportunity": True}, headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["account_id"] and body["contact_id"] and body["opportunity_id"]
    acc = client.get(f"/api/firmcrm/accounts/{body['account_id']}", headers=admin).json()
    assert acc["name"] == "Analytical Engines Ltd" and acc["contact_count"] == 1
    opp = client.get(f"/api/firmcrm/opportunities/{body['opportunity_id']}", headers=admin).json()
    assert opp["amount"] == 50000 and opp["stage_name"] == "Identified"
    # second convert is rejected
    assert client.post(f"/api/firmcrm/leads/{lead_id}/convert", json={}, headers=admin).status_code == 400


def test_won_requires_clearance_and_engagement_letter(client, admin):
    pas = client.get("/api/firmcrm/practice-areas", headers=admin).json()
    lit = next(p for p in pas if p["name"] == "Commercial Litigation")
    pipe = client.get("/api/firmcrm/pipelines", headers=admin).json()[0]
    stages = {s["name"]: s["id"] for s in pipe["stages"]}
    acc = client.post("/api/firmcrm/accounts", json={"name": "Gatekeeper Test Co"}, headers=admin).json()
    opp = client.post("/api/firmcrm/opportunities", json={"name": "Gatekeeper – litigation", "account_id": acc["id"],
                                                   "practice_area_id": lit["id"], "amount": 100000,
                                                   "adverse_parties": ["Northwind Robotics"]}, headers=admin).json()
    assert opp["clearance_type"] == "conflict" and opp["clearance_status"] is None
    # Cannot win without a check
    r = client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": stages["Closed Won"]}, headers=admin)
    assert r.status_code == 400 and r.json()["code"] == "clearance_required"
    # Run the check: adverse party matches an existing client -> pending
    r = client.post("/api/firmcrm/conflict-checks", json={"opportunity_id": opp["id"], "parties": ["Gatekeeper Test Co", "Northwind Robotics"]}, headers=admin)
    assert r.status_code == 201
    chk = r.json()
    assert chk["status"] == "pending"
    assert any(m["matched_name"] == "Northwind Robotics Inc" and m["relationship"] == "client" for m in chk["matches"])
    # Staff cannot waive; partner can, but needs a note
    staff = login(client, "staff@demo.firm")
    assert client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "waived"}, headers=staff).status_code == 403
    partner = login(client, "partner.lit@demo.firm")
    assert client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "waived"}, headers=partner).status_code == 400
    r = client.post(f"/api/firmcrm/conflict-checks/{chk['id']}/resolve", json={"status": "waived", "resolution_note": "Informed consent obtained from Northwind"}, headers=partner)
    assert r.status_code == 200 and r.json()["status"] == "waived"
    # Still blocked: engagement letter not signed
    r = client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": stages["Closed Won"]}, headers=admin)
    assert r.status_code == 400 and r.json()["code"] == "engagement_letter"
    client.patch(f"/api/firmcrm/opportunities/{opp['id']}", json={"engagement_letter_status": "signed"}, headers=admin)
    r = client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": stages["Closed Won"]}, headers=admin)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "won" and r.json()["probability"] == 100
    # Side effects: account becomes client, engagement created, history recorded
    assert client.get(f"/api/firmcrm/accounts/{acc['id']}", headers=admin).json()["account_type"] == "client"
    engs = client.get(f"/api/firmcrm/engagements?account_id={acc['id']}", headers=admin).json()["items"]
    assert len(engs) == 1 and engs[0]["annual_value"] == 100000
    hist = client.get(f"/api/firmcrm/opportunities/{opp['id']}/history", headers=admin).json()
    assert hist[-1]["to_stage_name"] == "Closed Won"


def test_lost_requires_reason(client, admin):
    pipe = client.get("/api/firmcrm/pipelines", headers=admin).json()[0]
    lost = next(s["id"] for s in pipe["stages"] if s["is_lost"])
    opp = client.get("/api/firmcrm/opportunities?status=open", headers=admin).json()["items"][0]
    r = client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": lost}, headers=admin)
    assert r.status_code == 400 and r.json()["code"] == "lost_reason"


def test_conflict_search_fuzzy(client, admin):
    r = client.post("/api/firmcrm/conflict-checks/search", json={"parties": ["Brightline Transport", "brightline logistics"]}, headers=admin)
    names = {m["matched_name"] for m in r.json()}
    assert "Brightline Transport" in names or "Brightline Logistics Corp" in names


def test_activity_touches_opportunity(client, admin):
    opp = client.get("/api/firmcrm/opportunities?status=open", headers=admin).json()["items"][0]
    r = client.post("/api/firmcrm/activities", json={"kind": "call", "subject": "Check-in", "opportunity_id": opp["id"]}, headers=admin)
    assert r.status_code == 201 and r.json()["account_id"] == opp["account_id"]
    assert client.get(f"/api/firmcrm/opportunities/{opp['id']}", headers=admin).json()["is_stale"] is False


def test_reports(client, admin):
    for path in ("dashboard", "pipeline", "win-loss", "practice-areas", "origination", "referral-sources", "funnel",
                 "stage-velocity", "activity-leaderboard"):
        r = client.get(f"/api/firmcrm/reports/{path}", headers=admin)
        assert r.status_code == 200, path
    d = client.get("/api/firmcrm/reports/dashboard", headers=admin).json()
    assert d["kpis"]["open_count"] > 0 and d["kpis"]["pending_clearances"] >= 2


def test_audit_trail(client, admin):
    rows = client.get("/api/firmcrm/admin/audit?entity_type=opportunity", headers=admin).json()["items"]
    assert any(r["action"] == "opportunity.stage_change" for r in rows)
    staff = login(client, "staff@demo.firm")
    assert client.get("/api/firmcrm/admin/audit", headers=staff).status_code == 403

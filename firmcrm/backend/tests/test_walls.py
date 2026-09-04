"""Ethical walls: record-level visibility."""

from tests.conftest import login


def _setup(client, admin):
    partner = login(client, "partner.lit@demo.firm")
    staff = login(client, "staff@demo.firm")
    mgr = login(client, "manager@demo.firm")
    acc = client.post("/api/accounts", json={"name": "Walled Client Co", "account_type": "client"}, headers=admin).json()
    contact = client.post("/api/contacts", json={"first_name": "Secret", "last_name": "Person", "email": "secret.person@walled.example.com", "account_id": acc["id"]}, headers=admin).json()
    opp = client.post("/api/opportunities", json={"name": "Walled matter", "account_id": acc["id"], "amount": 50000, "adverse_parties": ["Hostile Corp"]}, headers=admin).json()
    act = client.post("/api/activities", json={"kind": "note", "subject": "Confidential note", "opportunity_id": opp["id"]}, headers=admin).json()
    chk = client.post("/api/conflict-checks", json={"opportunity_id": opp["id"], "parties": ["Walled Client Co"]}, headers=admin).json()
    users = client.get("/api/users", headers=admin).json()
    uid = {u["email"]: u["id"] for u in users}
    return partner, staff, mgr, acc, contact, opp, act, chk, uid


def test_wall_hides_records_from_non_members_and_reveals_to_members(client, admin):
    partner, staff, mgr, acc, contact, opp, act, chk, uid = _setup(client, admin)
    # staff cannot create walls; partner can. Creator is auto-member; add the manager.
    assert client.post("/api/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "Litigation adverse to another client"}, headers=staff).status_code == 403
    r = client.post("/api/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "Litigation adverse to another client", "member_ids": [uid["manager@demo.firm"]]}, headers=partner)
    assert r.status_code == 201, r.text
    wall = r.json()
    assert {m["full_name"] for m in wall["members"]} == {"James Whitaker", "Sofia Lindqvist"}
    assert client.post("/api/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "duplicate wall attempt"}, headers=partner).status_code == 409

    # Non-member (staff): everything 404s and disappears from lists/search
    assert client.get(f"/api/accounts/{acc['id']}", headers=staff).status_code == 404
    assert client.get(f"/api/contacts/{contact['id']}", headers=staff).status_code == 404
    assert client.get(f"/api/opportunities/{opp['id']}", headers=staff).status_code == 404
    assert client.get(f"/api/opportunities/{opp['id']}/history", headers=staff).status_code == 404
    assert client.patch(f"/api/opportunities/{opp['id']}", json={"amount": 1}, headers=staff).status_code == 404
    assert client.patch(f"/api/activities/{act['id']}", json={"subject": "x"}, headers=staff).status_code == 404
    assert client.get(f"/api/conflict-checks/{chk['id']}", headers=staff).status_code == 404
    assert client.get("/api/accounts?q=Walled", headers=staff).json()["total"] == 0
    assert client.get("/api/contacts?q=secret.person", headers=staff).json()["total"] == 0
    assert client.get("/api/opportunities?q=Walled&status=all", headers=staff).json()["total"] == 0
    assert all(a["opportunity_id"] != opp["id"] for a in client.get("/api/activities?limit=500", headers=staff).json()["items"])
    assert all(c["id"] != chk["id"] for c in client.get("/api/conflict-checks?limit=500", headers=staff).json()["items"])
    # cannot create things inside the wall either
    assert client.post("/api/activities", json={"kind": "note", "subject": "sneak", "account_id": acc["id"]}, headers=staff).status_code == 404
    assert client.post("/api/opportunities", json={"name": "sneak", "account_id": acc["id"]}, headers=staff).status_code == 404
    assert client.post("/api/contacts", json={"first_name": "S", "last_name": "N", "account_id": acc["id"]}, headers=staff).status_code == 404
    # wall metadata itself is invisible to non-members
    assert client.get(f"/api/walls/{wall['id']}", headers=staff).status_code == 404
    assert client.get(f"/api/walls/for/account/{acc['id']}", headers=staff).status_code == 404
    assert client.get("/api/walls", headers=staff).json()["total"] == 0

    # Member (manager): sees everything
    assert client.get(f"/api/accounts/{acc['id']}", headers=mgr).status_code == 200
    assert client.get(f"/api/opportunities/{opp['id']}", headers=mgr).json()["name"] == "Walled matter"
    assert client.get("/api/contacts?q=secret.person", headers=mgr).json()["total"] == 1
    assert client.get(f"/api/walls/for/account/{acc['id']}", headers=mgr).json()["id"] == wall["id"]
    assert client.get("/api/walls", headers=mgr).json()["total"] == 1
    # Admin bypasses by default
    assert client.get(f"/api/accounts/{acc['id']}", headers=admin).status_code == 200

    # Export respects walls
    import csv
    import io

    rows = list(csv.DictReader(io.StringIO(client.get("/api/export/accounts.csv", headers=mgr).text)))
    assert any(r["name"] == "Walled Client Co" for r in rows)
    # (manager is a member; make a second manager-level user who is not)
    client.post("/api/users", json={"email": "outsider@demo.firm", "full_name": "Out Sider", "password": "Str0ngPassw0rd!!", "role": "manager"}, headers=admin)
    out_h = {"Authorization": f"Bearer {client.post('/api/auth/login', json={'email': 'outsider@demo.firm', 'password': 'Str0ngPassw0rd!!'}).json()['access_token']}"}
    import time

    time.sleep(1.1)
    r = client.post("/api/auth/change-password", json={"current_password": "Str0ngPassw0rd!!", "new_password": "An0therStrongOne!"}, headers=out_h)
    out_h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    rows = list(csv.DictReader(io.StringIO(client.get("/api/export/accounts.csv", headers=out_h).text)))
    assert not any(r["name"] == "Walled Client Co" for r in rows)

    # Conflict search still matches the walled party, but redacts context and id for non-members
    m = client.post("/api/conflict-checks/search", json={"parties": ["Walled Client Co", "Hostile Corp"]}, headers=staff).json()
    walled = [x for x in m if x["matched_name"] == "Walled Client Co"]
    assert walled and walled[0]["restricted"] is True and walled[0]["entity_id"] is None and "Restricted" in walled[0]["context"]
    hostile = [x for x in m if x["matched_name"] == "Hostile Corp"]
    assert hostile and hostile[0]["restricted"] is True
    m2 = client.post("/api/conflict-checks/search", json={"parties": ["Walled Client Co"]}, headers=mgr).json()
    assert any(x["matched_name"] == "Walled Client Co" and x["restricted"] is False and x["entity_id"] == acc["id"] for x in m2)

    # Member management
    assert client.post(f"/api/walls/{wall['id']}/members", json={"user_id": uid["staff@demo.firm"]}, headers=partner).status_code == 200
    assert client.get(f"/api/accounts/{acc['id']}", headers=staff).status_code == 200
    assert client.post(f"/api/walls/{wall['id']}/members", json={"user_id": uid["staff@demo.firm"]}, headers=partner).status_code == 409
    assert client.delete(f"/api/walls/{wall['id']}/members/{uid['staff@demo.firm']}", headers=partner).status_code == 200
    assert client.get(f"/api/accounts/{acc['id']}", headers=staff).status_code == 404
    assert client.post(f"/api/walls/{wall['id']}/members", json={"user_id": 999999}, headers=partner).status_code == 404

    # Lift the wall -> visible again; audit trail complete
    assert client.post(f"/api/walls/{wall['id']}/lift", headers=mgr).status_code == 403  # manager cannot lift
    assert client.post(f"/api/walls/{wall['id']}/lift", headers=partner).json()["is_active"] is False
    assert client.post(f"/api/walls/{wall['id']}/lift", headers=partner).status_code == 400
    assert client.get(f"/api/accounts/{acc['id']}", headers=staff).status_code == 200
    assert client.get(f"/api/walls/for/account/{acc['id']}", headers=staff).json() is None
    assert client.get("/api/walls?include_inactive=true", headers=partner).json()["total"] >= 1
    audit = client.get(f"/api/admin/audit?entity_type=ethical_wall&entity_id={wall['id']}", headers=admin).json()["items"]
    assert {a["action"] for a in audit} >= {"wall.create", "wall.add_member", "wall.remove_member", "wall.lift"}


def test_opportunity_level_wall_and_last_member_rule(client, admin):
    partner = login(client, "partner.corp@demo.firm")
    staff = login(client, "staff@demo.firm")
    acc = client.post("/api/accounts", json={"name": "Open Client With Secret Matter"}, headers=admin).json()
    public_opp = client.post("/api/opportunities", json={"name": "Public matter", "account_id": acc["id"], "amount": 1000}, headers=admin).json()
    secret_opp = client.post("/api/opportunities", json={"name": "Secret matter", "account_id": acc["id"], "amount": 2000}, headers=admin).json()
    eng = client.post("/api/engagements", json={"name": "Secret engagement", "account_id": acc["id"], "opportunity_id": secret_opp["id"]}, headers=admin).json()
    w = client.post("/api/walls", json={"entity_type": "opportunity", "entity_id": secret_opp["id"], "reason": "Board-level confidential transaction"}, headers=partner).json()
    # account and public matter stay visible; the secret matter + its engagement vanish
    assert client.get(f"/api/accounts/{acc['id']}", headers=staff).status_code == 200
    assert client.get(f"/api/opportunities/{public_opp['id']}", headers=staff).status_code == 200
    assert client.get(f"/api/opportunities/{secret_opp['id']}", headers=staff).status_code == 404
    names = {o["name"] for o in client.get(f"/api/opportunities?account_id={acc['id']}&status=all", headers=staff).json()["items"]}
    assert names == {"Public matter"}
    assert all(e["id"] != eng["id"] for e in client.get(f"/api/engagements?account_id={acc['id']}", headers=staff).json()["items"])
    assert client.patch(f"/api/engagements/{eng['id']}", json={"status": "completed"}, headers=login(client, "manager@demo.firm")).status_code == 404
    # creator is the only member: cannot remove themselves
    creator_id = w["members"][0]["user_id"]
    assert client.delete(f"/api/walls/{w['id']}/members/{creator_id}", headers=partner).json()["code"] == "last_member"
    # validation
    assert client.post("/api/walls", json={"entity_type": "account", "entity_id": 999999, "reason": "nothing here"}, headers=partner).status_code == 404
    assert client.post("/api/walls", json={"entity_type": "lead", "entity_id": 1, "reason": "bad type"}, headers=partner).status_code == 422
    assert client.post("/api/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "x"}, headers=partner).status_code == 422
    assert client.post("/api/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "unknown member", "member_ids": [999999]}, headers=partner).status_code == 400


def test_aggregate_reports_unaffected_by_walls(client, admin):
    """Firm-wide KPIs remain consistent for everyone; only record-level access is restricted."""
    staff = login(client, "staff@demo.firm")
    a = client.get("/api/reports/pipeline", headers=admin).json()["total_amount"]
    s = client.get("/api/reports/pipeline", headers=staff).json()["total_amount"]
    assert a == s

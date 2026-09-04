from .conftest import login

def test_opportunity_level_wall_and_last_member_rule(client, admin):
    partner = login(client, "partner.corp@demo.firm")
    staff = login(client, "staff@demo.firm")
    acc = client.post("/api/firmcrm/accounts", json={"name": "Open Client With Secret Matter"}, headers=admin).json()
    public_opp = client.post("/api/firmcrm/opportunities", json={"name": "Public matter", "account_id": acc["id"], "amount": 1000}, headers=admin).json()
    secret_opp = client.post("/api/firmcrm/opportunities", json={"name": "Secret matter", "account_id": acc["id"], "amount": 2000}, headers=admin).json()
    eng = client.post("/api/firmcrm/engagements", json={"name": "Secret engagement", "account_id": acc["id"], "opportunity_id": secret_opp["id"]}, headers=admin).json()
    w = client.post("/api/firmcrm/walls", json={"entity_type": "opportunity", "entity_id": secret_opp["id"], "reason": "Board-level confidential transaction"}, headers=partner).json()
    # account and public matter stay visible; the secret matter + its engagement vanish
    assert client.get(f"/api/firmcrm/accounts/{acc['id']}", headers=staff).status_code == 200
    assert client.get(f"/api/firmcrm/opportunities/{public_opp['id']}", headers=staff).status_code == 200
    assert client.get(f"/api/firmcrm/opportunities/{secret_opp['id']}", headers=staff).status_code == 404
    names = {o["name"] for o in client.get(f"/api/firmcrm/opportunities?account_id={acc['id']}&status=all", headers=staff).json()["items"]}
    assert names == {"Public matter"}
    assert all(e["id"] != eng["id"] for e in client.get(f"/api/firmcrm/engagements?account_id={acc['id']}", headers=staff).json()["items"])
    assert client.patch(f"/api/firmcrm/engagements/{eng['id']}", json={"status": "completed"}, headers=login(client, "manager@demo.firm")).status_code == 404
    # creator is the only member: cannot remove themselves
    creator_id = w["members"][0]["user_id"]
    assert client.delete(f"/api/firmcrm/walls/{w['id']}/members/{creator_id}", headers=partner).json()["code"] == "last_member"
    # validation
    assert client.post("/api/firmcrm/walls", json={"entity_type": "account", "entity_id": 999999, "reason": "nothing here"}, headers=partner).status_code == 404
    assert client.post("/api/firmcrm/walls", json={"entity_type": "lead", "entity_id": 1, "reason": "bad type"}, headers=partner).status_code == 422
    assert client.post("/api/firmcrm/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "x"}, headers=partner).status_code == 422
    assert client.post("/api/firmcrm/walls", json={"entity_type": "account", "entity_id": acc["id"], "reason": "unknown member", "member_ids": ["unknown-firebase-uid"]}, headers=partner).status_code == 400

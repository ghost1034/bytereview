import re
from pathlib import Path

from firmcrm import enums
from .conftest import login


def test_pagination_envelope(client, admin):
    r = client.get("/api/firmcrm/accounts?limit=5&offset=0", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"items", "total", "limit", "offset"}
    assert len(body["items"]) == 5 and body["total"] >= 24 and body["limit"] == 5
    r2 = client.get("/api/firmcrm/accounts?limit=5&offset=5", headers=admin).json()
    assert {a["id"] for a in r2["items"]}.isdisjoint({a["id"] for a in body["items"]})
    assert client.get("/api/firmcrm/accounts?limit=0", headers=admin).status_code == 422
    assert client.get("/api/firmcrm/accounts?limit=5000", headers=admin).status_code == 422


def test_validation_error_body_is_consistent(client, admin):
    r = client.post("/api/firmcrm/accounts", json={"name": "", "account_type": "martian"}, headers=admin)
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "validation_error" and isinstance(body["errors"], list)
    locs = {e["loc"] for e in body["errors"]}
    assert "name" in locs and "account_type" in locs
    # Enum validation on query params too
    assert client.get("/api/firmcrm/accounts?account_type=martian", headers=admin).status_code == 422
    assert client.get("/api/firmcrm/leads?status=bogus", headers=admin).status_code == 422
    # Unknown fields on PATCH are rejected (extra=forbid)
    opp = client.get("/api/firmcrm/opportunities?status=open", headers=admin).json()["items"][0]
    assert client.patch(f"/api/firmcrm/opportunities/{opp['id']}", json={"status": "won"}, headers=admin).status_code == 422


def test_account_duplicate_guard_and_override(client, admin):
    r = client.post("/api/firmcrm/accounts", json={"name": "northwind robotics inc"}, headers=admin)
    assert r.status_code == 409 and r.json()["code"] == "duplicate"
    # alias match counts too
    assert client.post("/api/firmcrm/accounts", json={"name": "Brightline Transport"}, headers=admin).status_code == 409
    dups = client.get("/api/firmcrm/accounts/duplicates?name=brightline%20transport", headers=admin).json()
    assert any(d["name"] == "Brightline Logistics Corp" for d in dups)
    r = client.post("/api/firmcrm/accounts", json={"name": "Brightline Transport", "allow_duplicate": True}, headers=admin)
    assert r.status_code == 201


def test_contact_email_uniqueness(client, admin):
    acc = client.get("/api/firmcrm/accounts?limit=1", headers=admin).json()["items"][0]
    r = client.post("/api/firmcrm/contacts", json={"first_name": "Uni", "last_name": "Que", "email": "Unique.Person@Example.com", "account_id": acc["id"]}, headers=admin)
    assert r.status_code == 201 and r.json()["email"] == "unique.person@example.com"
    cid = r.json()["id"]
    r2 = client.post("/api/firmcrm/contacts", json={"first_name": "Other", "last_name": "Person", "email": "UNIQUE.PERSON@example.com"}, headers=admin)
    assert r2.status_code == 409 and r2.json()["code"] == "duplicate"
    # Archive frees the address; restore is blocked while a live duplicate exists
    assert client.post(f"/api/firmcrm/contacts/{cid}/archive", headers=admin).status_code == 200
    r3 = client.post("/api/firmcrm/contacts", json={"first_name": "Other", "last_name": "Person", "email": "unique.person@example.com"}, headers=admin)
    assert r3.status_code == 201
    assert client.post(f"/api/firmcrm/contacts/{cid}/restore", headers=admin).status_code == 409
    # Archived contacts are hidden by default, visible with include_archived
    ids = {c["id"] for c in client.get("/api/firmcrm/contacts?q=Que&include_archived=false", headers=admin).json()["items"]}
    assert cid not in ids
    ids = {c["id"] for c in client.get("/api/firmcrm/contacts?q=Que&include_archived=true", headers=admin).json()["items"]}
    assert cid in ids


def test_archive_rules_and_rbac(client, admin):
    staff = login(client, "staff@demo.firm")
    acc = client.post("/api/firmcrm/accounts", json={"name": "Archive Me LLC"}, headers=admin).json()
    opp = client.post("/api/firmcrm/opportunities", json={"name": "Archive blocker", "account_id": acc["id"], "amount": 1000}, headers=admin).json()
    # staff cannot archive accounts; manager+ can, but not while open opportunities exist
    assert client.post(f"/api/firmcrm/accounts/{acc['id']}/archive", headers=staff).status_code == 403
    r = client.post(f"/api/firmcrm/accounts/{acc['id']}/archive", headers=admin)
    assert r.status_code == 400 and r.json()["code"] == "in_use"
    # open opportunity cannot be archived either
    assert client.post(f"/api/firmcrm/opportunities/{opp['id']}/archive", headers=admin).json()["code"] == "open"
    pipe = client.get("/api/firmcrm/pipelines", headers=admin).json()[0]
    lost = next(s["id"] for s in pipe["stages"] if s["is_lost"])
    client.post(f"/api/firmcrm/opportunities/{opp['id']}/stage", json={"stage_id": lost, "lost_reason": "timing"}, headers=admin)
    assert client.post(f"/api/firmcrm/opportunities/{opp['id']}/archive", headers=admin).status_code == 200
    assert client.post(f"/api/firmcrm/accounts/{acc['id']}/archive", headers=admin).status_code == 200
    assert client.post(f"/api/firmcrm/accounts/{acc['id']}/archive", headers=admin).json()["code"] == "already_archived"
    # Hidden from default list; hard delete is admin-only and blocked while referenced
    assert acc["id"] not in {a["id"] for a in client.get("/api/firmcrm/accounts?limit=500", headers=admin).json()["items"]}
    assert client.delete(f"/api/firmcrm/accounts/{acc['id']}", headers=login(client, "manager@demo.firm")).status_code == 403
    assert client.delete(f"/api/firmcrm/accounts/{acc['id']}", headers=admin).json()["code"] == "in_use"
    assert client.post(f"/api/firmcrm/accounts/{acc['id']}/restore", headers=admin).json()["is_archived"] is False
    audit = client.get(f"/api/firmcrm/admin/audit?entity_type=account&entity_id={acc['id']}", headers=admin).json()["items"]
    assert {a["action"] for a in audit} >= {"account.create", "account.archive", "account.restore"}


def test_archived_accounts_still_surface_in_conflict_search(client, admin):
    acc = client.post("/api/firmcrm/accounts", json={"name": "Former Client Holdings", "account_type": "former_client"}, headers=admin).json()
    client.post(f"/api/firmcrm/accounts/{acc['id']}/archive", headers=admin)
    matches = client.post("/api/firmcrm/conflict-checks/search", json={"parties": ["Former Client Holdings"]}, headers=admin).json()
    assert any(m["entity_id"] == acc["id"] and m["context"] == "archived" for m in matches)



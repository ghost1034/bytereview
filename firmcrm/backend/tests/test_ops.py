def test_health_is_liveness_only(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok" and "version" in r.json()


def test_ready_checks_db_and_migrations(client):
    r = client.get("/api/ready")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ready" and body["checks"]["database"] is True and body["checks"]["migrations_at_head"] is True


def test_security_headers_and_request_id(client, admin):
    r = client.get("/api/accounts?limit=1", headers={**admin, "x-request-id": "trace-abc-123"})
    h = r.headers
    assert h["x-request-id"] == "trace-abc-123"
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
    assert h["content-security-policy"].startswith("default-src 'none'")
    assert h["cache-control"] == "no-store"
    assert "strict-transport-security" not in h  # only in production
    r2 = client.get("/api/accounts?limit=1", headers=admin)
    assert len(r2.headers["x-request-id"]) == 16


def test_oversized_request_rejected(client, admin):
    r = client.post("/api/accounts", content=b"{}", headers={**admin, "content-type": "application/json", "content-length": str(50 * 1024 * 1024)})
    assert r.status_code == 413 and r.json()["code"] == "too_large"


def test_unknown_route_is_json_404(client, admin):
    r = client.get("/api/nope", headers=admin)
    assert r.status_code == 404 and r.headers["content-type"].startswith("application/json")
